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

## Improving speed

Two main factors influence the delay between the moment a video is requested and when it starts casting:

- **Internet Bandwidth**  
  Generally, using an Ethernet cable is more reliable and faster than Wi-Fi. Additionally, some Raspberry Pi models, like the Raspberry Pi 3 that I'm using, only support 2.4GHz Wi-Fi and not 5GHz, which can introduce further delays. That said, internet bandwidth is typically not the primary bottleneck on a standard Raspberry Pi.

- **Storage Bandwidth**  
  By default, Raspberry Pi devices use Micro SD cards for storage. Their performance varies significantly depending on quality, typically ranging from 5 MB/s to 20 MB/s. However, due to bus limitations, speeds generally can't exceed this range. For better performance, it's possible to use a USB drive or an SSD (though SSDs are more expensive).  
  To benchmark storage speed, you can run:  
  ```bash
  dd if=/dev/zero of=./largefile bs=8k count=100000
  ```
  In my case, I measured average write speeds of 24 MB/s on one USB drive, 8.5 MB/s on another, and 12 MB/s on the default Micro SD card.

## ToDo
- Investigate low video quality issue
- Add possibility to start a new video when another is still playing
- Being able to change VLC password
- Add a cache for videos to be able to replay a vido without downloading it again
- (?) Improve HTTP response to indicate the progress