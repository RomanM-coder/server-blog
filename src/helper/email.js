const nodemailer = require("nodemailer")

const sendEmail = async (email, subj, message) => {
  try {
    console.log('-----------', email)
    console.log('-----------', subj)
    console.log('-----------', message)
    const transporter = nodemailer.createTransport({
      host: 'smtp.yandex.ru',
      port: 465,
      secure: true,
      auth: {
        user: "rm.splinter@yandex.ru",
        pass: "fioikpuiojeeyunc"
      }
    })

    // transporter.verify(function (error, success) {
    //   if (error) {
    //     console.log('error ', error)
    //   } else {
    //     console.log('Server is ready')
    //   }
    // })

    const mailOptions = {
      from: 'rm.splinter@yandex.ru',
      to: email,
      subject: subj,
      text: message
    }
    // await transporter.sendMail(mailOptions)
    // const info = 
    await transporter.sendMail(mailOptions)
    //   , (error, info) => {
    //   if (error) {
    //     return console.log(error)
    //   }
    //   console.log("Message sent: %s", info.messageId)
    // })
    console.log("email sent sucessfully")
  } catch (error) {
    console.log("email not sent")
    console.log(error)
  }
}

module.exports = sendEmail