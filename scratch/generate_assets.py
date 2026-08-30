import os
from PIL import Image, ImageOps

logo_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
dest_dirs = [
    "/Users/akshay/Documents/Build/FitApp/assets",
    "/Users/akshay/Documents/Build/FitApp/fitapp/assets"
]

def make_foreground_transparent(img):
    # Convert image to RGBA
    rgba = img.convert("RGBA")
    data = rgba.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        # If it is white or very close to white, make it transparent
        if r > 240 and g > 240 and b > 240:
            # Fully transparent
            new_data.append((255, 255, 255, 0))
        else:
            # Opaque
            new_data.append((r, g, b, 255))
            
    rgba.putdata(new_data)
    return rgba

def make_monochrome(transparent_img):
    # Take the transparent image and make all opaque pixels flat white (or black/gray)
    rgba = transparent_img.convert("RGBA")
    data = rgba.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 0:
            # Solid white for themed icon
            new_data.append((255, 255, 255, a))
        else:
            new_data.append((0, 0, 0, 0))
            
    rgba.putdata(new_data)
    return rgba

def process_and_save():
    # Open the source logo
    img = Image.open(logo_path)
    
    # 1. Base 1024x1024 icons
    icon_1024 = img.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # 2. Favicon 48x48
    favicon = img.resize((48, 48), Image.Resampling.LANCZOS)
    
    # 3. Android Adaptive Foreground (with transparent background)
    foreground = make_foreground_transparent(img)
    foreground_512 = foreground.resize((512, 512), Image.Resampling.LANCZOS)
    
    # 4. Android Adaptive Background (solid #111113)
    bg_color = (17, 17, 19) # #111113
    background_512 = Image.new("RGBA", (512, 512), bg_color + (255,))
    
    # 5. Android Adaptive Monochrome (flat shape on transparent)
    monochrome = make_monochrome(foreground)
    monochrome_432 = monochrome.resize((432, 432), Image.Resampling.LANCZOS)
    
    # Save to both target directories
    for d in dest_dirs:
        print(f"Saving assets to: {d}")
        os.makedirs(os.path.join(d, "images"), exist_ok=True)
        
        # Save icon.png
        icon_1024.save(os.path.join(d, "icon.png"), "PNG")
        icon_1024.save(os.path.join(d, "images", "icon.png"), "PNG")
        
        # Save favicon.png
        favicon.save(os.path.join(d, "favicon.png"), "PNG")
        
        # Save adaptive icons
        foreground_512.save(os.path.join(d, "android-icon-foreground.png"), "PNG")
        background_512.save(os.path.join(d, "android-icon-background.png"), "PNG")
        monochrome_432.save(os.path.join(d, "android-icon-monochrome.png"), "PNG")
        
    print("Asset generation complete!")

if __name__ == "__main__":
    process_and_save()
