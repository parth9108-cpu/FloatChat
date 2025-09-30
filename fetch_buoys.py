import requests

def fetch_buoy_data():
    endpoints = {
        "moored": "https://your-website.com/fetchMooredBuoyData.jsp",
        "aws": "https://your-website.com/fetchAWSBuoyData.jsp",
        "drifting": "https://your-website.com/fetchDRIFTINGBuoyData.jsp",
        "argo": "https://your-website.com/fetchArgoData.jsp"
    }

    for buoy_type, url in endpoints.items():
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            print(f"\n=== {buoy_type.upper()} BUOYS ===")
            print(response.json())
        except Exception as e:
            print(f"Error fetching {buoy_type}: {e}")

if __name__ == "__main__":
    fetch_buoy_data()
