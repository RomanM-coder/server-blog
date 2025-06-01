import { Router, Request, Response } from 'express'
import webPush from 'web-push'

const router = Router()

router.post('/api/notify', async (req, res) => {
  const { subscription, message } = req.body

  try {
    await webPush.sendNotification(subscription, JSON.stringify({
      title: 'Новое уведомление',
      body: message,
      icon: '/icon-192x192.png'
    }));
    res.status(200).json({ success: true })
  } catch (error) {
    handlerError(error, res)
  }
})

const handlerError = (e: unknown, res: Response) => {
  if (e instanceof Error) { 
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.name
    )})
  } else {
    console.log('Unknown error:', e)
  }
}

export default router