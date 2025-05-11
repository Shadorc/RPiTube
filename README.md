```text
____________ _ _____     _          
| ___ \ ___ (_)_   _|   | |         
| |_/ / |_/ /_  | |_   _| |__   ___ 
|    /|  __/| | | | | | | '_ \ / _ \
| |\ \| |   | | | | |_| | |_) |  __/
\_| \_\_|   |_| \_/\__,_|_.__/ \___|  
```
I was curious to see if it was possible to replicate Chromecast functionality without relying on the official API. This small project demonstrates how to launch a YouTube video from a smartphone to a Chromecast using a Raspberry Pi. It’s more of a proof of concept than a practical solution, mainly due to the delay it introduces before the video starts casting.

I tested it on my desktop using WSL, where it took about 1 minute to load a 1h15min video (1006 MB), a significant improvement over the 3 minutes it took to load a 12-minute video on my Raspberry Pi 3. If I ever get my hands on a cheap Raspberry Pi 5, it might just be fast enough to make this approach viable.

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
- [Optional] [Set a static IP address](https://www.tomshardware.com/how-to/static-ip-raspberry-pi) to ensure the Raspberry Pi always uses the same IP after reboot, making it easier to connect

## Setup RPiTube
1. `wget https://raw.githubusercontent.com/Shadorc/RPiTube/master/setup.sh`
2. `sudo sh setup.sh`

## Usage
1/ Start the server using `sudo sh start-server.sh [--vlc-password <password>]`  
2/ Cast a YouTube video:
- From browser: 
  1. Encode the YouTube URL you want to use using https://www.urlencoder.org
  2. Connect to `http://<RPI_IP>:3000/cast/<CHROMECAST_IP>/<ENCODED_URL>`  
  
- From Android:
  1. Download `http_shortcut_rpitube.json`
  2. Edit line 21 to set both `<RPI_IP>` and `<CHROMECAST_IP>`
  3. Upload the file on your phone
  4. Open HTTP Request Shortcut settings and import 
  5. From the YouTube app, share a video to `RPiTube Cast`

3/ Control video using VLC's Web interface available at `http://<RPI_IP>:8080`. 
Leave the username field blank and enter the password (`rpitube` if you didn't defined one using `--vlc-password`).
The HTML has been slightly modified to remove all the buttons that do not work with the Chromecast.

## Limitations

Two main factors influence the delay between the moment a video is requested and when it starts casting:

- **Internet Bandwidth**  
  Network capabilities greatly depend on the model of the Raspberry Pi used. Models like the Pi 3B only support 2.4GHz, typically capped around 10–20 MB/s. Starting with the Raspberry Pi 3B+, 5GHz Wi-Fi support was introduced, offering theoretical speeds up to 55 MB/s.

  On the Ethernet side, the Pi 3B+ features "Gigabit Ethernet over USB 2.0," limiting actual throughput to around 37MB/s. The Raspberry Pi 4 and Pi 5 come with true Gigabit Ethernet, reaching up to 110MB/s in real-world conditions.

- **Storage Bandwidth**  
  By default, Raspberry Pi devices use Micro SD cards for storage. Their performance varies significantly depending on quality, typically ranging from 5 MB/s to 20 MB/s. However, due to bus limitations, speeds generally can't exceed this range. For better performance, it's possible to use a USB drive or an SSD (though SSDs are more expensive).  
  To benchmark storage speed, you can run:  
  ```bash
  dd if=/dev/zero of=./largefile bs=8k count=100000
  ```
  In my case, I measured average write speeds of 24 MB/s on one USB drive, 8.5 MB/s on another, and 12 MB/s on the default Micro SD card.

## ToDo
- Add possibility to start a new video when another is still playing
- Improve HTTP responses