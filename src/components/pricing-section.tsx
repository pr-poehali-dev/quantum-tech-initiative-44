import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Icon from "@/components/ui/icon"

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/мес",
    description: "Для пилотов и небольших проектов",
    features: [
      "1M токенов в день",
      "Чат-модели до 7B",
      "1 API-ключ",
      "Email поддержка",
      "Базовая аналитика",
    ],
    cta: "Начать",
    highlight: false,
  },
  {
    name: "Business",
    price: "$499",
    period: "/мес",
    description: "Для растущих продуктов",
    features: [
      "50M токенов в день",
      "Все модели до 70B",
      "10 API-ключей",
      "SLA 99.9%",
      "Приоритетная поддержка",
      "Расширенная аналитика",
    ],
    cta: "Подключить",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Для крупных компаний",
    features: [
      "Безлимит токенов",
      "On-premise развёртывание",
      "Fine-tuning под ваши данные",
      "Выделенный SRE-инженер",
      "SLA 99.99%",
      "Юридический контракт",
    ],
    cta: "Связаться",
    highlight: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 slide-up">
          <h2 className="text-5xl font-bold text-foreground mb-4 font-sans">Прозрачные цены</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            В 10× дешевле OpenAI на масштабе. Платите только за то, что используете.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <Card
              key={p.name}
              className={`relative p-8 transition ${
                p.highlight
                  ? "border-primary shadow-lg shadow-primary/20 scale-105"
                  : "bg-card hover:border-primary/40"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  Популярный
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{p.description}</p>
                <div>
                  <span className="text-5xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground ml-1">{p.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Icon name="Check" size={16} className="text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  p.highlight ? "bg-primary hover:bg-primary/90" : ""
                }`}
                variant={p.highlight ? "default" : "outline"}
                onClick={() => {
                  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })
                }}
              >
                {p.cta}
              </Button>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Все тарифы включают OpenAI-совместимый API, 100% конфиденциальность данных и доступ к Dashboard.
        </p>
      </div>
    </section>
  )
}
