#!/usr/bin/env python3
"""
Qwen Code Agent — аналог Claude Code.
Использование:
  python main.py interactive          — интерактивный режим
  python main.py review [file]        — code review
  python main.py refactor <file>      — рефакторинг файла
  python main.py test <file>          — написать тесты
  python main.py explain <file>       — объяснить код
  python main.py search <query>       — поиск по кодовой базе
  python main.py commit               — сформировать commit message
"""
import os
import sys
import json
import subprocess
import textwrap
from pathlib import Path
from openai import OpenAI
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.syntax import Syntax
from rich.prompt import Prompt
from rich import print as rprint

API_BASE = os.environ.get("QWEN_API_BASE", "http://localhost:8000/v1")
API_KEY = os.environ.get("QWEN_API_KEY", "sk-code-agent-key")
MODEL = os.environ.get("QWEN_MODEL", "qwen3.5-27b")
MAX_TOKENS = int(os.environ.get("QWEN_MAX_TOKENS", "8192"))
WORKSPACE = os.environ.get("QWEN_WORKSPACE", os.getcwd())

console = Console()
client = OpenAI(api_key=API_KEY, base_url=API_BASE)

SYSTEM_PROMPT = """Ты — Qwen Code Agent, опытный senior-разработчик.

Твои задачи:
- Анализировать и писать код
- Делать code review с конкретными предложениями
- Рефакторить код (чище, быстрее, надёжнее)
- Писать тесты
- Объяснять сложный код простым языком
- Помогать с git

Правила:
- Всегда объясняй ЧТО и ПОЧЕМУ
- Показывай конкретные изменения (было → стало)
- Если видишь баг — сразу укажи
- Код на языке файла, объяснения на русском
- Будь конкретным и лаконичным"""

TOOL_SYSTEM = """Ты — Qwen Code Agent с доступом к инструментам.

Доступные команды (пиши их в ответе в формате ```tool):
- READ <path>         — прочитать файл
- WRITE <path>        — записать файл (следующая строка = содержимое до END)
- RUN <command>       — выполнить shell-команду
- SEARCH <pattern>    — поиск по файлам (grep)
- LIST [path]         — список файлов
- GIT <args>          — git команда

Пример:
```tool
READ src/main.py
```

Когда всё сделано — дай итоговый ответ пользователю."""


def read_file(path: str) -> str:
    try:
        p = Path(WORKSPACE) / path if not Path(path).is_absolute() else Path(path)
        return p.read_text(encoding="utf-8")
    except Exception as e:
        return f"Ошибка чтения {path}: {e}"


def write_file(path: str, content: str) -> str:
    try:
        p = Path(WORKSPACE) / path if not Path(path).is_absolute() else Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Файл записан: {path}"
    except Exception as e:
        return f"Ошибка записи {path}: {e}"


def run_command(cmd: str) -> str:
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=WORKSPACE, timeout=30)
        out = result.stdout + result.stderr
        return out[:3000] if out else "(нет вывода)"
    except subprocess.TimeoutExpired:
        return "Таймаут 30с"
    except Exception as e:
        return f"Ошибка: {e}"


def search_code(pattern: str) -> str:
    return run_command(f"grep -rn '{pattern}' --include='*.py' --include='*.js' --include='*.ts' --include='*.go' . 2>/dev/null | head -50")


def list_files(path: str = ".") -> str:
    return run_command(f"find {path} -type f -not -path '*/.*' -not -path '*/node_modules/*' -not -path '*/__pycache__/*' | head -100")


def git_command(args: str) -> str:
    return run_command(f"git {args}")


def execute_tool(tool_call: str) -> str:
    lines = tool_call.strip().splitlines()
    if not lines:
        return ""
    cmd_line = lines[0].strip()
    parts = cmd_line.split(None, 1)
    if not parts:
        return ""
    cmd = parts[0].upper()
    arg = parts[1] if len(parts) > 1 else ""

    if cmd == "READ":
        return read_file(arg)
    elif cmd == "WRITE":
        content = "\n".join(lines[1:])
        if content.endswith("END"):
            content = content[:-3].rstrip()
        return write_file(arg, content)
    elif cmd == "RUN":
        return run_command(arg)
    elif cmd == "SEARCH":
        return search_code(arg)
    elif cmd == "LIST":
        return list_files(arg or ".")
    elif cmd == "GIT":
        return git_command(arg)
    else:
        return f"Неизвестная команда: {cmd}"


def ask(system: str, messages: list, stream: bool = True) -> str:
    all_messages = [{"role": "system", "content": system}] + messages
    if stream:
        full = ""
        with console.status("[cyan]Думаю...[/cyan]"):
            resp = client.chat.completions.create(
                model=MODEL,
                messages=all_messages,
                max_tokens=MAX_TOKENS,
                stream=True,
            )
        console.print()
        for chunk in resp:
            delta = chunk.choices[0].delta.content or ""
            full += delta
            print(delta, end="", flush=True)
        print()
        return full
    else:
        resp = client.chat.completions.create(model=MODEL, messages=all_messages, max_tokens=MAX_TOKENS)
        return resp.choices[0].message.content


def agentic_loop(user_message: str):
    messages = [{"role": "user", "content": user_message}]
    for _ in range(10):
        response = ask(TOOL_SYSTEM, messages, stream=False)
        if "```tool" in response:
            parts = response.split("```tool")
            if len(parts) > 1:
                tool_block = parts[1].split("```")[0]
                tool_result = execute_tool(tool_block)
                console.print(Panel(f"[cyan]Инструмент:[/cyan]\n{tool_block.strip()}\n\n[green]Результат:[/green]\n{tool_result[:1000]}", title="Tool"))
                messages.append({"role": "assistant", "content": response})
                messages.append({"role": "user", "content": f"Результат инструмента:\n{tool_result}"})
                continue
        console.print(Markdown(response))
        break


def interactive_mode():
    console.print(Panel(
        "[bold cyan]Qwen Code Agent[/bold cyan]\n"
        f"Модель: [yellow]{MODEL}[/yellow] | Workspace: [green]{WORKSPACE}[/green]\n"
        "Команды: [dim]exit[/dim] — выход | [dim]/help[/dim] — помощь | [dim]/run <cmd>[/dim] — shell",
        title="Qwen Code Agent"
    ))
    history = []
    while True:
        try:
            user_input = Prompt.ask("\n[bold green]You[/bold green]")
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]Выход[/dim]")
            break

        if user_input.strip().lower() in ("exit", "quit", "q"):
            break
        if user_input.strip() == "/help":
            console.print(Markdown(__doc__))
            continue
        if user_input.strip().startswith("/run "):
            cmd = user_input[5:]
            result = run_command(cmd)
            console.print(Syntax(result, "bash", theme="monokai"))
            continue
        if not user_input.strip():
            continue

        history.append({"role": "user", "content": user_input})
        console.print("\n[bold magenta]Agent[/bold magenta]")
        response = ask(SYSTEM_PROMPT, history)
        history.append({"role": "assistant", "content": response})


def review_mode(target: str = "."):
    files = []
    p = Path(WORKSPACE) / target
    if p.is_file():
        files = [(target, p.read_text(encoding="utf-8", errors="ignore"))]
    else:
        for ext in ["*.py", "*.js", "*.ts", "*.go", "*.rs"]:
            for f in p.rglob(ext):
                if "node_modules" not in str(f) and "__pycache__" not in str(f):
                    files.append((str(f.relative_to(WORKSPACE)), f.read_text(encoding="utf-8", errors="ignore")))
                if len(files) >= 5:
                    break

    if not files:
        console.print("[red]Файлы не найдены[/red]")
        return

    code_block = "\n\n".join(f"### {name}\n```\n{content[:2000]}\n```" for name, content in files)
    prompt = f"Сделай code review следующих файлов. Найди баги, проблемы безопасности, предложи улучшения:\n\n{code_block}"
    console.print(Panel(f"Ревью: {', '.join(f[0] for f in files)}", title="Code Review"))
    response = ask(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
    console.print(Markdown(response))


def refactor_mode(target: str):
    p = Path(WORKSPACE) / target
    if not p.exists():
        console.print(f"[red]Файл не найден: {target}[/red]")
        return
    content = p.read_text(encoding="utf-8", errors="ignore")
    prompt = f"Отрефактори этот код. Покажи улучшенную версию с объяснением изменений:\n\n```\n{content}\n```"
    console.print(Panel(f"Рефакторинг: {target}", title="Refactor"))
    response = ask(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
    console.print(Markdown(response))


def test_mode(target: str):
    p = Path(WORKSPACE) / target
    if not p.exists():
        console.print(f"[red]Файл не найден: {target}[/red]")
        return
    content = p.read_text(encoding="utf-8", errors="ignore")
    prompt = f"Напиши юнит-тесты для этого кода. Покрой основные случаи и edge-cases:\n\n```\n{content}\n```"
    console.print(Panel(f"Тесты для: {target}", title="Test Generator"))
    response = ask(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
    console.print(Markdown(response))


def commit_mode():
    diff = git_command("diff --staged")
    if not diff or "fatal" in diff:
        diff = git_command("diff HEAD~1")
    if not diff:
        console.print("[yellow]Нет изменений для коммита[/yellow]")
        return
    prompt = f"Сформируй commit message в формате Conventional Commits для этих изменений:\n\n```diff\n{diff[:3000]}\n```"
    console.print(Panel("Генерация commit message", title="Git Commit"))
    response = ask(SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
    console.print(Markdown(response))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "interactive"
    arg = sys.argv[2] if len(sys.argv) > 2 else ""

    if cmd == "interactive":
        interactive_mode()
    elif cmd == "review":
        review_mode(arg or ".")
    elif cmd == "refactor":
        if not arg:
            console.print("[red]Укажи файл: qwen-agent refactor <file>[/red]")
            sys.exit(1)
        refactor_mode(arg)
    elif cmd == "test":
        if not arg:
            console.print("[red]Укажи файл: qwen-agent test <file>[/red]")
            sys.exit(1)
        test_mode(arg)
    elif cmd == "commit":
        commit_mode()
    elif cmd == "ask":
        if not arg:
            console.print("[red]Укажи вопрос: qwen-agent ask 'вопрос'[/red]")
            sys.exit(1)
        agentic_loop(arg)
    else:
        console.print(Markdown(__doc__))


if __name__ == "__main__":
    main()
