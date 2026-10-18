```text
____________ _ _____     _          
| ___ \ ___ (_)_   _|   | |         
| |_/ / |_/ /_  | |_   _| |__   ___ 
|    /|  __/| | | | | | | '_ \ / _ \
| |\ \| |   | | | | |_| | |_) |  __/
\_| \_\_|   |_| \_/\__,_|_.__/ \___|  
```
Web service for downloading YouTube videos and casting them to a Chromecast-compatible device, controlled through the VLC web interface.

## Requirements
- Windows/Linux OS
- NodeJS v17+
- Android App: [HTTP Request Shortcuts](https://play.google.com/store/apps/details?id=ch.rmy.android.http_shortcuts)

## Setup RPiTube
1. [Optional] [Pass cookies to prevent captcha](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
2. Run `git clone https://github.com/Shadorc/RPiTube`
3. Run `npm run setup`

## Usage
1/ Start the server using `npm start [-- [--vlc-password <password>] [--cache-folder <folder>] [--port <port>] [--verbose] [--cookies <file>] [--chromecast-ip <ip>]]`
2/ Cast a YouTube video:
- From Android:
  1. Download `http_request_shortcuts/http_shortcut_rpitube.json`
  2. Edit line 26 to set `<WEBSERVICE_IP>` and `<WEBSERVICE_PORT>`
  3. Upload the file on your phone
  4. Open HTTP Request Shortcut settings and import 
  5. From the YouTube app, share a video to `RPiTube Cast`

3/ Control video using VLC's Web interface available at `http://<WEBSERVICE_IP>:8080`.  
Leave the username field blank and enter the password (`rpitube` if you didn't defined one using `--vlc-password`).  