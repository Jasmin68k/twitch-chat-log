const WebSocket = require('ws')
const fs = require('fs')
const https = require('https')

const tokenFilePath = './twitch-tokens.json'

let keepaliveInterval
const keepaliveIntervalTime = 300000 // 5 minutes
let keepaliveTimeout
const keepaliveTimeoutTime = 10000 // 10 seconds

if (process.argv.length < 6) {
  console.error(
    'Usage: node <script> <client_id> <client_secret> <nick> <channel1> <channel2> ...'
  )
  process.exit(1)
}

const [client_id, client_secret, user, ...channels] = process.argv.slice(2)
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

function readTokensFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error(
      `${formatCurrentTime()} Error reading tokens from file:`,
      error
    )
    return null
  }
}

function writeTokensToFile(filePath, tokens) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8')
  } catch (error) {
    console.error(`${formatCurrentTime()} Error writing tokens to file:`, error)
  }
}

function refreshAccessToken(
  refreshToken,
  clientId,
  clientSecret,
  callback,
  attempt = 1
) {
  const maxAttempts = 100 // Maximum number of retry attempts
  const retryDelay = Math.pow(2, attempt) * 1000 // Exponential backoff

  const postData = `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}`
  const options = {
    hostname: 'id.twitch.tv',
    path: '/oauth2/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }

  const req = https.request(options, (res) => {
    let data = ''

    res.on('data', (chunk) => {
      data += chunk
    })

    res.on('end', () => {
      const parsedData = JSON.parse(data)
      if (res.statusCode === 200) {
        callback(null, parsedData)
      } else {
        if (attempt < maxAttempts) {
          console.error(
            `${formatCurrentTime()} Token refresh failed, retrying in ${
              retryDelay / 1000
            } seconds...`
          )
          setTimeout(() => {
            refreshAccessToken(
              refreshToken,
              clientId,
              clientSecret,
              callback,
              attempt + 1
            )
          }, retryDelay)
        } else {
          callback(new Error('Maximum token refresh attempts exceeded'), null)
        }
      }
    })
  })

  req.on('error', (e) => {
    if (attempt < maxAttempts) {
      console.error(
        `${formatCurrentTime()} Token refresh failed, retrying in ${
          retryDelay / 1000
        } seconds...`,
        e
      )
      setTimeout(() => {
        refreshAccessToken(
          refreshToken,
          clientId,
          clientSecret,
          callback,
          attempt + 1
        )
      }, retryDelay)
    } else {
      callback(e, null)
    }
  })

  req.write(postData)
  req.end()
}

let tokens = readTokensFromFile(tokenFilePath)
if (!tokens) {
  console.error(`${formatCurrentTime()} Failed to read tokens. Exiting...`)
  process.exit(1)
}

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
    console.error(
      `${formatCurrentTime()} Authentication failed. Token might be expired or invalid.`
    )
    refreshAccessToken(
      tokens.refresh_token,
      client_id,
      client_secret,
      (err, newTokens) => {
        if (err) {
          console.error(`${formatCurrentTime()} Error refreshing token:`, err)
          return
        }

        tokens = newTokens
        writeTokensToFile(tokenFilePath, newTokens)
        console.log(`${formatCurrentTime()} Token refreshed. Reconnecting...`)
        setupWebSocket()
      }
    )
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
      socket.send(`PASS oauth:${tokens.access_token}`)
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
