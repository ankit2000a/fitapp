from PIL import Image

def inspect(path):
    try:
        img = Image.open(path)
        print(f"\nAsset: {path}")
        print(f"Format: {img.format}, Size: {img.size}, Mode: {img.mode}")
        if 'A' in img.mode:
            # check if it has transparent pixels
            alpha = img.split()[-1]
            extrema = alpha.getextrema()
            print(f"Alpha channel range: {extrema} (min 0 = transparent, max 255 = opaque)")
        else:
            print("No alpha channel")
    except Exception as e:
        print(f"Error reading {path}: {e}")

inspect("/Users/akshay/Documents/Build/FitApp/fitapp/assets/android-icon-foreground.png")
inspect("/Users/akshay/Documents/Build/FitApp/fitapp/assets/android-icon-background.png")
inspect("/Users/akshay/Documents/Build/FitApp/fitapp/assets/icon.png")
