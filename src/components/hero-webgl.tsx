import { useState, useEffect } from "react"

const TEXTURE_URL = "https://cdn.poehali.dev/projects/b65c2369-7509-43f0-9f19-06d08f174c71/bucket/hero/texture-map.png"

export const Hero3DWebGL = () => {
  const titleWords = "deway AI".split(" ")
  const subtitle = "Пишет код # Создаёт изображения # Генерирует видео # Отвечает на вопросы"
  const [visibleWords, setVisibleWords] = useState(0)
  const [subtitleVisible, setSubtitleVisible] = useState(false)
  const [delays] = useState<number[]>(() => titleWords.map(() => Math.random() * 0.07))
  const [subtitleDelay] = useState(() => Math.random() * 0.1)
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)

  useEffect(() => {
    if (visibleWords < titleWords.length) {
      const t = setTimeout(() => setVisibleWords(v => v + 1), 600)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => setSubtitleVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [visibleWords, titleWords.length])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouseX((e.clientX / window.innerWidth - 0.5) * 20)
      setMouseY((e.clientY / window.innerHeight - 0.5) * 20)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className="h-screen bg-black relative overflow-hidden">
      {/* Parallax background image */}
      <div
        className="absolute inset-[-40px] bg-center bg-cover transition-transform duration-100 ease-out"
        style={{
          backgroundImage: `url(${TEXTURE_URL})`,
          transform: `translate(${mouseX}px, ${mouseY}px) scale(1.1)`,
          filter: 'brightness(0.6)',
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)',
        }}
      />

      {/* Edge gradients */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-32 bg-gradient-to-r from-black to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-32 bg-gradient-to-l from-black to-transparent" />
      </div>

      {/* Text */}
      <div className="h-screen uppercase items-center w-full absolute z-[60] pointer-events-none px-10 flex justify-center flex-col">
        <div className="text-3xl md:text-5xl xl:text-6xl 2xl:text-7xl font-extrabold font-orbitron">
          <div className="flex space-x-2 lg:space-x-6 overflow-hidden text-white">
            {titleWords.map((word, index) => (
              <div
                key={index}
                className={index < visibleWords ? "fade-in" : ""}
                style={{
                  animationDelay: `${index * 0.13 + (delays[index] || 0)}s`,
                  opacity: index < visibleWords ? undefined : 0,
                }}
              >
                {word}
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs md:text-xl xl:text-2xl 2xl:text-3xl mt-2 overflow-hidden text-white font-bold max-w-4xl mx-auto text-center px-4">
          <div
            className={subtitleVisible ? "fade-in-subtitle" : ""}
            style={{
              animationDelay: `${titleWords.length * 0.13 + 0.2 + subtitleDelay}s`,
              opacity: subtitleVisible ? undefined : 0,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero3DWebGL
