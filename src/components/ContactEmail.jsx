import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Почта в контактах. mailto: открывает почтовую программу по умолчанию —
 * на телефонах это работает, а на компьютерах часто нет (не настроена почта,
 * или mailto «заворачивается» обратно в браузер). Поэтому при нажатии адрес
 * ещё и копируется в буфер обмена, и внизу экрана появляется подсказка.
 * Своё состояние — чтобы подсказка не перерисовывала всё приложение и 3D-сцену.
 */
export default function ContactEmail({ email, className }) {
  const [toast, setToast] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onClick = () => {
    // переход по mailto не отменяем — где почта настроена, она откроется
    copy(email).then((ok) => {
      if (!ok) return
      setToast(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(false), 2600)
    })
  }

  return (
    <>
      <a className={className} href={`mailto:${email}`} onClick={onClick} title="Написать письмо (адрес скопируется)">
        {email}
      </a>
      {/* подсказка — в body: внутри надписи (transform) position: fixed не работает */}
      {createPortal(
        <div className={`copy-toast${toast ? ' is-visible' : ''}`} role="status" aria-hidden={!toast}>
          Почта скопирована — вставьте её в письмо
        </div>,
        document.body,
      )}
    </>
  )
}

/** Копирование в буфер: современный способ, а если недоступен — запасной */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
