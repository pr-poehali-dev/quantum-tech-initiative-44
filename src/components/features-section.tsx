import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const features = [
  {
    title: "Генерация кода",
    description: "Пишет сайты, приложения и скрипты на любом языке. Просто опишите задачу — deway реализует её.",
    icon: "brain",
    badge: "Разработка",
  },
  {
    title: "Создание изображений",
    description: "Генерирует уникальные иллюстрации, логотипы и визуалы по текстовому описанию за секунды.",
    icon: "globe",
    badge: "Дизайн",
  },
  {
    title: "Генерация видео",
    description: "Создаёт видеоролики, анимации и рекламные клипы по вашему сценарию без видеоредактора.",
    icon: "zap",
    badge: "Видео",
  },
  {
    title: "Умные ответы",
    description: "Отвечает на вопросы, анализирует данные, пишет тексты — как персональный эксперт 24/7.",
    icon: "target",
    badge: "Ассистент",
  },
  {
    title: "API Gateway",
    description: "Единый API-ключ для доступа ко всем моделям. Rate limiting, квоты и биллинг из коробки.",
    icon: "link",
    badge: "API",
  },
  {
    title: "Мульти-модельный роутинг",
    description: "Автоматически выбирает оптимальную модель для задачи — быстро, точно и экономично.",
    icon: "lock",
    badge: "Умный роутинг",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4 font-sans">Всё что нужно — в одном месте</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            deway объединяет мощь лучших AI-моделей в единую платформу для работы, творчества и разработки
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="glow-border hover:shadow-lg transition-all duration-300 slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">
                    {feature.icon === "brain" && "&#129504;"}
                    {feature.icon === "lock" && "&#128274;"}
                    {feature.icon === "globe" && "&#127760;"}
                    {feature.icon === "zap" && "&#9889;"}
                    {feature.icon === "link" && "&#128279;"}
                    {feature.icon === "target" && "&#127919;"}
                  </span>
                  <Badge variant="secondary" className="bg-accent text-accent-foreground">
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-xl font-bold text-card-foreground">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}