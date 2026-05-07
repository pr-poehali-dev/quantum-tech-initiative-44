import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const testimonials = [
  {
    name: "Алексей Петров",
    role: "CTO, TechStart",
    avatar: "/cybersecurity-expert-man.jpg",
    content:
      "deway заменил нам целый отдел разработки прототипов. Скорость и качество кода — выше всяких ожиданий.",
  },
  {
    name: "Мария Соколова",
    role: "Руководитель маркетинга, GrowthLab",
    avatar: "/professional-woman-scientist.png",
    content:
      "Создаём рекламные материалы в 10 раз быстрее. deway понимает задачу с первого раза и выдаёт готовый результат.",
  },
  {
    name: "Дмитрий Ли",
    role: "Основатель, ApiForge",
    avatar: "/asian-woman-tech-developer.jpg",
    content:
      "Встроили deway API в наш продукт за день. Мульти-модельный роутинг и аналитика — именно то, что нам было нужно.",
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-24 px-6 bg-card">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-card-foreground mb-4 font-sans">Нам доверяют команды</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Разработчики, маркетологи и предприниматели используют deway каждый день
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="glow-border slide-up" style={{ animationDelay: `${index * 0.15}s` }}>
              <CardContent className="p-6">
                <p className="text-card-foreground mb-6 leading-relaxed italic">"{testimonial.content}"</p>
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={testimonial.avatar || "/placeholder.svg"} alt={testimonial.name} />
                    <AvatarFallback>
                      {testimonial.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-primary">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}