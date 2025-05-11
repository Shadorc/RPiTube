## Requirements
- Raspberry Pi 3 or above
- [Raspberry Pi OS Lite 64 bits](https://www.raspberrypi.com/software/operating-systems/#raspberry-pi-os-64-bit)
- Android App: [HTTP Request Shortcuts](https://play.google.com/store/apps/details?id=ch.rmy.android.http_shortcuts)
- Find your Chromecast's local IP address
    - You can usually find this on your router's admin page, often accessible at 192.168.1.1.

## Setup Raspberry Pi OS (from fresh install)
- Configure WiFi
    - `raspi-config `
        - System Options > Wireless LAN
        - Localisation Options > WLAN Country
- `sudo apt-get update -y && sudo apt-get upgrade -y`

## Setup RPiTube
1. `wget https://raw.githubusercontent.com/Shadorc/RPiTube/master/setup.sh`
2. `sudo sh setup.sh`

## Usage
- In browser: 
    - Encode the YouTube URL you want to use using https://www.urlencoder.orgv
    - Connect to `http://<RPI_IP>:3000/cast/<CHROMECAST_IP>/<ENCODED_URL>`
- In HTTP Request Shortcut:
    1. Download `http_shortcut_rpitube.json`
    2. Edit line 21 to set both `<RPI_IP>` and `<CHROMECAST_IP>`
    3. Upload the file on your phone
    4. Open HTTP Request Shortcut settings and import 
    5. From the YouTube app, share a video to `RPiTube Cast`

When the video is playing, you can control it using VLC's Web interface available at `http://<RPI_IP>:8080`.
Leave the username field blank and enter the `rpitube` as password.

## ToDo
- Use video name for the filename
- Add a cache for videos to be able to replay a vido without downloading it again
- (?) Improve HTTP response to indicate the progress
- Investigate low video quality issue
- Add possibility to start a new video when another is still playing
- Investigate how to improve speed (SSD?)
- Being able to change VLC password