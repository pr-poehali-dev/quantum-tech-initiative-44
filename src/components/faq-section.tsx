import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export function FAQSection() {
  const faqs = [
    {
      question: "Что такое deway и чем он отличается от других AI-сервисов?",
      answer:
        "deway — это универсальная AI-платформа, которая объединяет лучшие модели для генерации кода, изображений, видео и текста. В отличие от точечных решений, deway предоставляет единый API с умным роутингом между моделями, управлением ключами и аналитикой.",
    },
    {
      question: "Как начать использовать deway?",
      answer:
        "Зарегистрируйтесь, получите API-ключ и начните отправлять запросы. Документация и примеры кода доступны сразу после регистрации. Техническая настройка занимает не более 15 минут.",
    },
    {
      question: "Какие модели поддерживает deway?",
      answer:
        "Платформа поддерживает Qwen, Llama и другие модели через Ollama. Список постоянно расширяется — deway активно развивается и добавляет новые возможности.",
    },
    {
      question: "Можно ли встроить deway в свой продукт?",
      answer:
        "Да, именно для этого создан API deway. Вы получаете управление ключами, rate limiting, квоты и трекинг использования — всё готово для интеграции в ваш сервис.",
    },
    {
      question: "Как работает тарификация и биллинг?",
      answer:
        "Оплата идёт по количеству использованных токенов. В панели управления можно видеть расход в реальном времени, устанавливать лимиты и управлять квотами для каждого ключа.",
    },
    {
      question: "Насколько быстро deway отвечает на запросы?",
      answer:
        "Время ответа зависит от выбранной модели и типа задачи. Для текстовых запросов — обычно секунды. Генерация изображений и видео занимает больше времени, но выполняется асинхронно.",
    },
  ]

  return (
    <section className="py-24 bg-black">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-orbitron">Частые вопросы</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto font-space-mono">
            Всё что нужно знать о возможностях, интеграции и тарифах deway.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-red-500/20 mb-4">
                <AccordionTrigger className="text-left text-lg font-semibold text-white hover:text-red-400 font-orbitron px-6 py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 leading-relaxed px-6 pb-4 font-space-mono">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}