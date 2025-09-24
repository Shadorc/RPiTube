```text
____________ _ _____     _          
| ___ \ ___ (_)_   _|   | |         
| |_/ / |_/ /_  | |_   _| |__   ___ 
|    /|  __/| | | | | | | '_ \ / _ \
| |\ \| |   | | | | |_| | |_) |  __/
\_| \_\_|   |_| \_/\__,_|_.__/ \___|  
```
Web service for downloading YouTube videos and casting them to a Chromecast, controlled through the VLC web interface.

## Requirements
- Debian based OS
- Android App: [HTTP Request Shortcuts](https://play.google.com/store/apps/details?id=ch.rmy.android.http_shortcuts)
- Chromecast's local IP address
    - You can usually find this on your router's admin page, often accessible at 192.168.1.1.

## Setup RPiTube
1. `wget https://raw.githubusercontent.com/Shadorc/RPiTube/master/setup.sh`
2. `chmod +x setup.sh`
3. `sudo ./setup.sh`

## Usage
1/ Start the server using `sudo ./start-server.sh [--vlc-password <password>]`  
2/ Cast a YouTube video:
- From browser: 
  1. Encode the YouTube URL you want to use using https://www.urlencoder.org
  2. Connect to `http://<WEBSERVICE_IP>:3000/cast/<CHROMECAST_IP>/<ENCODED_URL>`  
  
- From Android:
  1. Download `http_request_shortcuts/http_shortcut_rpitube.json`
  2. Edit line 21 to set both `<WEBSERVICE_IP>` and `<CHROMECAST_IP>`
  3. Upload the file on your phone
  4. Open HTTP Request Shortcut settings and import 
  5. From the YouTube app, share a video to `RPiTube Cast`

3/ Control video using VLC's Web interface available at `http://<WEBSERVICE_IP>:8080`.  
Leave the username field blank and enter the password (`rpitube` if you didn't defined one using `--vlc-password`).  
The HTML has been slightly modified to remove all the buttons that do not work with the Chromecast.

## ToDo
- Add possibility to start a new video when another is still playing
- Improve HTTP responses