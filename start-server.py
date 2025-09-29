import sys
import subprocess

def main():
    print("Starting webservice...")
    # Build the command: node rpitube-server.js plus any arguments passed to this script
    cmd = ["node", "rpitube-server.js"] + sys.argv[1:]
    subprocess.run(cmd, check=True)

if __name__ == "__main__":
    main()
