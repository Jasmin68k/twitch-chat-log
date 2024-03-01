const WebSocket = require('ws')

if (process.argv.length < 5) {
  console.error(
    'Usage: node <script> <oauth_token> <nick> <channel1> <channel2> ...'
  )
  process.exit(1)
}

const [oauth_token, user, ...channels] = process.argv.slice(2)
let socket
let attempt = 0 // Attempt counter for reconnections
const maxAttempts = 100 // Maximum number of reconnection attempts

function formatCurrentTime() {
  const now = new Date()
  return now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

let keepaliveInterval
const keepaliveIntervalTime = 300000 // 5 minutes
let keepaliveTimeout
const keepaliveTimeoutTime = 10000 // 10 seconds

function handleMessage(event) {
  // Reset on any message enough, doesn't have to be PONG
  // clearTimeout(keepaliveTimeout)

  // Check if the message is a PONG message
  if (event.data.startsWith('PONG')) {
    clearTimeout(keepaliveTimeout)
    // trim only for display, otherwise blank line
    // console.log(`${formatCurrentTime()} ${event.data.trim()}`)
  } else if (event.data.startsWith('PING')) {
    // Construct the PONG response by replacing "PING" at beginning with "PONG" - need to send back entire msg after PING
    const pongMessage = event.data.replace(/^PING/, 'PONG')
    socket.send(pongMessage)
    // trim only for display, otherwise blank line
    // console.log(`${formatCurrentTime()} [SENT] ${pongMessage.trim()}`)
  } else {
    // trim, otherwise blank line
    console.log(`${formatCurrentTime()} ${event.data.trim()}`)
  }

  if (
    event.data.includes('Login authentication failed') ||
    event.data.includes('Improperly formatted auth')
  ) {
    console.error(`${formatCurrentTime()} Exiting...`)
    process.exit(1)
  }
}

function handleClose() {
  isConnected = false
  stopKeepaliveMechanism()
  if (attempt < maxAttempts) {
    const retryDelay = Math.pow(2, attempt) * 1000 // Exponential backoff
    console.error(
      `${formatCurrentTime()} Connection closed. Reconnecting in ${
        retryDelay / 1000
      } seconds...`
    )
    setTimeout(setupWebSocket, retryDelay)
    attempt++
  } else {
    console.error(
      `${formatCurrentTime()} Maximum reconnection attempts exceeded. Exiting...`
    )
    process.exit(1)
  }
}

let isConnected = false

function handleError(error) {
  console.error(`${formatCurrentTime()} WebSocket error:`, error.message)

  if (!isConnected) {
    if (attempt < maxAttempts) {
      const retryDelay = Math.pow(2, attempt) * 1000
      console.error(
        `${formatCurrentTime()} Attempting to reconnect in ${
          retryDelay / 1000
        } seconds...`
      )
      setTimeout(setupWebSocket, retryDelay)
      attempt++
    } else {
      console.error(
        `${formatCurrentTime()} Maximum reconnection attempts exceeded. Exiting...`
      )
      process.exit(1)
    }
  }
}

function startKeepaliveMechanism() {
  clearInterval(keepaliveInterval)
  keepaliveInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send('PING')
      // console.log(`${formatCurrentTime()} [SENT] PING`)
      clearTimeout(keepaliveTimeout)
      keepaliveTimeout = setTimeout(() => {
        console.error(
          `${formatCurrentTime()} No response to PING, attempting to reconnect...`
        )
        setupWebSocket()
      }, keepaliveTimeoutTime)
    }
  }, keepaliveIntervalTime)
}

function stopKeepaliveMechanism() {
  clearInterval(keepaliveInterval)
  clearTimeout(keepaliveTimeout)
}

function setupWebSocket() {
  if (socket) {
    stopKeepaliveMechanism()
    socket.removeEventListener('message', handleMessage)
    socket.removeEventListener('close', handleClose)
    socket.removeEventListener('error', handleError)
    socket.close()
  }

  attempt = 0

  const attemptConnection = () => {
    socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443')

    socket.addEventListener('open', () => {
      isConnected = true
      attempt = 0
      console.log(`${formatCurrentTime()} Connected to Twitch IRC`)
      socket.send(`PASS oauth:${oauth_token}`)
      socket.send(`NICK ${user}`)
      channels.forEach((channel) => {
        socket.send(`JOIN #${channel}`)
      })
      startKeepaliveMechanism()
    })
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)
  }

  attemptConnection()
}

setupWebSocket()
