# Twitch Chat Log

Lightweight, self-contained Node.js script to log Twitch chat messages from multiple channels, without the need for additional libraries.

## Features

- Logs chat messages to the console
- Automatic reconnection to Twitch IRC with exponential backoff in case of disconnects
- Automatic refresh of access and refresh tokens with retries (using exponential backoff)
- Bidirectional PING/PONG keep-alive mechanism (actively sending PINGs and responding to PONGs)

## Requirements

- Node.js

## Setup

**Note:** The following instructions are for the script called `twitch-chat-log.js`, which uses a Twitch registered application to access Twitch chat. If you'd like to use an OAuth token extracted from your browser cookies instead, see below.

### Register a Twitch Application

Visit the Twitch developer console: https://dev.twitch.tv/console and register a new application to obtain a Client ID and Client Secret.

### Authorize Your Application

Follow the instructions here to give your application the `chat:read` scope: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow

You'll receive an authorization code. Use this code to obtain an access token and refresh token as described.

The access code is used for initial authorization. The refresh token is used to automatically update the access token when it expires.

### Store Tokens
Create a file named `twitch-tokens.json` in the same directory as the script with the following structure (needs write permissions):

```JSON
    {
      "access_token": "your_access_token",
      "refresh_token": "your_refresh_token",
      ... 
    }
```

While only `access_token` and `refresh_token` are strictly necessary, storing the complete date as received from Twitch won't hurt.

## Usage

```Bash
node <script> <client_id> <client_secret> <nick> <channel1> <channel2> ...
```

`<script>`: The name of the script (`twitch-chat-log.js`)
    
`<client_id>`: Your Twitch application's Client ID
    
`<client_secret>`: Your Twitch application's Client Secret
    
`<nick>`: The IRC nickname you want to use (doesn't have to be your Twitch username)
    
`<channel1>` `<channel2>` `...`: A list of Twitch channels to join and log.
  
## Alternative: Use OAuth token from browser cookies

The following instructions are for the script called `twitch-chat-log-browser.js`.

For using an OAuth token from your browser session (which usually does not expire and only becomes invalid, when you log out of the browser session, change password etc.), instead of registering an application with Twitch as described above, proceed as follows.

**Important note: An OAuth token extracted from browser cookies cannot be automatically refreshed, when it expires or becomes invalid.**

- Log into Twitch in a browser
- Extract cookies for your Twitch session in Netscape format. For Firefox and Chrome, these two extensions are a simple way to do that: https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/ / https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
- From the extracted cookies note the `auth-token` key (not `auth-token.mnb`!)
- See usage below

```Bash
node <script> <oauth_token> <nick> <channel1> <channel2> ...
```

`<script>`: The name of the script (`twitch-chat-browser.js`)
    
`<oauth_token>`: Your OAuth token (as extracted from cookies)
    
`<nick>`: The IRC nickname you want to use (doesn't have to be your Twitch username)
    
`<channel1>` `<channel2>` `...`: A list of Twitch channels to join and log.

## Security Note

The scripts store tokens in a basic JSON file and expose client id, client secret and OAuth token on the command line (details depending on which script you use).
    
For enhanced security, consider using environment variables or a more secure configuration file and adapt the code to read from these sources.
