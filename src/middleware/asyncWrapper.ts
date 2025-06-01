import { RequestHandler } from 'express'

function asyncWrapper(handler: (req: any, res: any, next: any) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next) // Передаем ошибки в next
  }
}

export default asyncWrapper