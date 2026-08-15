import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

interface TranslateResult {
  translation: string
  detectedLang: string
}

export const LANGUAGES = [
  { code: 'auto', name: 'Detectar' },
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'Inglés' },
  { code: 'fr', name: 'Francés' },
  { code: 'de', name: 'Alemán' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Portugués' },
  { code: 'ca', name: 'Catalán' },
  { code: 'ru', name: 'Ruso' },
  { code: 'zh', name: 'Chino' },
  { code: 'ja', name: 'Japonés' },
  { code: 'ko', name: 'Coreano' },
  { code: 'ar', name: 'Árabe' },
  { code: 'nl', name: 'Neerlandés' },
] as const

async function translate(text: string, langpair: string): Promise<TranslateResult> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('request failed')
  const data = (await res.json()) as {
    responseStatus: number
    responseData: { translatedText: string; detectedLanguage?: { language: string } }
    detectedLanguage?: { language: string }
  }
  if (data.responseStatus !== 200) throw new Error('translation failed')
  const detected =
    data.detectedLanguage?.language ?? data.responseData.detectedLanguage?.language ?? '?'
  return { translation: data.responseData.translatedText, detectedLang: detected }
}

interface WidgetProps {
  onClose: () => void
  onInject: (text: string) => void
  initialText?: string
}

export function TranslateWidget({ onClose, onInject, initialText }: WidgetProps) {
  const [sourceText, setSourceText] = useState(initialText ?? '')
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('es')
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Debounced translate whenever text or languages change (covers the seeded initialText too).
  useEffect(() => {
    const text = sourceText.trim()
    if (!text) {
      setResult(null)
      setError(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const langpair = sourceLang === 'auto' ? `autodetect|${targetLang}` : `${sourceLang}|${targetLang}`
        const r = await translate(text, langpair)
        setResult(r)
        setLoading(false)
      } catch {
        setError(true)
        setLoading(false)
      }
    }, 400)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [sourceText, sourceLang, targetLang])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && result) {
      e.preventDefault()
      onInject(result.translation)
    }
  }

  return (
    <>
      <div className="omni-tr-langs">
        <select
          className="omni-tr-select"
          value={sourceLang}
          onChange={(e) => {
            setSourceLang(e.target.value)
            setResult(null)
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="omni-tr-arrow">→</span>
        <select
          className="omni-tr-select"
          value={targetLang}
          onChange={(e) => {
            setTargetLang(e.target.value)
            setResult(null)
          }}
        >
          {LANGUAGES.filter((l) => l.code !== 'auto').map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={textareaRef}
        className="omni-tr-textarea"
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="texto a traducir…"
        rows={3}
        spellCheck={false}
      />

      {loading && <div className="omni-tr-status">traduciendo…</div>}

      {error && <div className="omni-tr-status omni-tr-error">⚠ Falló la traducción — revisa la conexión</div>}

      {result && !loading && !error && (
        <>
          <div className="omni-tr-result" onClick={() => onInject(result.translation)}>
            <span className="omni-tr-result-lang">{result.detectedLang} →</span>
            <span className="omni-tr-result-text">{result.translation}</span>
          </div>
          <div className="omni-tr-hint">
            <span className="omni-tr-key">⌘↵</span> copiar · clic para copiar
          </div>
        </>
      )}

      {!sourceText.trim() && !loading && !error && !result && (
        <div className="omni-tr-status">escribe arriba — el resultado aparece aquí</div>
      )}
    </>
  )
}
