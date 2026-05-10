import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Icon from "@/components/ui/icon"
import { toast } from "sonner"

export function ContactSection() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    volume: "До 10M",
    message: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const existing = JSON.parse(localStorage.getItem("deway_leads") || "[]")
      existing.push({ ...form, created_at: new Date().toISOString() })
      localStorage.setItem("deway_leads", JSON.stringify(existing))

      await new Promise((r) => setTimeout(r, 600))
      setSubmitted(true)
      toast.success("Заявка отправлена! Свяжемся в течение рабочего дня.")
    } catch {
      toast.error("Ошибка отправки. Попробуйте ещё раз.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="contact" className="py-24 px-6 bg-gradient-to-b from-background to-primary/5">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12 slide-up">
          <h2 className="text-5xl font-bold text-foreground mb-4 font-sans">Запросить доступ</h2>
          <p className="text-xl text-muted-foreground">
            Расскажите о задаче — команда свяжется с вами в течение рабочего дня.
          </p>
        </div>

        <Card className="p-8 md:p-10">
          {submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon name="CheckCircle2" size={32} className="text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Спасибо!</h3>
              <p className="text-muted-foreground mb-6">
                Мы получили вашу заявку. Менеджер свяжется с вами по адресу{" "}
                <span className="text-foreground font-medium">{form.email}</span>.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false)
                  setForm({ name: "", company: "", email: "", volume: "До 10M", message: "" })
                }}
              >
                Отправить ещё одну
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Имя</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-11 px-3 rounded-md border border-border bg-input text-foreground focus:border-primary focus:outline-none transition"
                    placeholder="Иван Петров"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Компания</label>
                  <input
                    required
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full h-11 px-3 rounded-md border border-border bg-input text-foreground focus:border-primary focus:outline-none transition"
                    placeholder="ООО Технологии"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Рабочий email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-11 px-3 rounded-md border border-border bg-input text-foreground focus:border-primary focus:outline-none transition"
                  placeholder="ivan@company.com"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Планируемый объём токенов в месяц</label>
                <select
                  value={form.volume}
                  onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  className="w-full h-11 px-3 rounded-md border border-border bg-input text-foreground focus:border-primary focus:outline-none transition"
                >
                  <option>До 10M</option>
                  <option>10M – 100M</option>
                  <option>100M – 1B</option>
                  <option>1B+</option>
                  <option>Пока не знаю</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Расскажите о задаче</label>
                <textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground focus:border-primary focus:outline-none transition resize-none"
                  placeholder="Например: чат-бот для поддержки клиентов, анализ юридических документов, ассистент для разработчиков..."
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {submitting ? (
                  <>
                    <Icon name="Loader2" size={18} className="mr-2 animate-spin" />
                    Отправляем...
                  </>
                ) : (
                  <>
                    <Icon name="Send" size={18} className="mr-2" />
                    Отправить заявку
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Нажимая «Отправить», вы соглашаетесь с обработкой персональных данных.
              </p>
            </form>
          )}
        </Card>
      </div>
    </section>
  )
}
