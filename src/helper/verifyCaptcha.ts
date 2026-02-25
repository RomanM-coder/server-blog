// server/verifyCaptcha.ts
interface ReCaptchaResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

export async function verifyCaptcha(token: string) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || ''

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    })

    const response = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )

    const data = (await response.json()) as ReCaptchaResponse
    console.log('✅ reCAPTCHA verification result:', data)

    // Если есть ошибки, логируем их
    if (data['error-codes']) {
      console.error('❌ reCAPTCHA errors:', data['error-codes'])
    }

    return data.success
  } catch (error) {
    console.error('❌ reCAPTCHA verification failed:', error)
    return false
  }
}
