import fs from 'fs'

class FileService {
  createDir(filePath: string) {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(filePath)) {
          fs.mkdirSync(filePath) //  { recursive: true }
          return resolve({ message: 'File was created' })
        } else {
          return reject({ message: 'File already exist' })
        }
      } catch (e) {
        return reject({ message: 'File error' })
      }
    })
  }
  deleteFile(filePath: string) {
    return new Promise((resolve, reject) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          return resolve({ message: 'File was deleted' })
        } else {
          return reject({ message: "File doesn't exist" })
        }
      } catch (e) {
        return reject({ message: 'Delete file error' })
      }
    })
  }
}

export default new FileService()
