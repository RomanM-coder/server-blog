const userHandlers = (io, socket) => {

  // обрабатываем сообщение пользователю
  socket.on('user login', message => {
    // io.emit('user login', message)
    console.log('message:', message)

  })
  // обрабатываем отключения пользователя
  socket.on('disconnect', () => {
    socket.emit('log', `User ${userName} disconnected`)
  })
}

module.exports = userHandlers