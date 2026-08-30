import os
import math
from PIL import Image

logo_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
dest_dirs = [
    "/Users/akshay/Documents/Build/FitApp/assets",
    "/Users/akshay/Documents/Build/FitApp/fitapp/assets"
]

# We will load the egg-only image we generated or generate it on the fly
# Let's generate the egg-only logo on the fly at 1024x1024 with transparency
img = Image.open(logo_path)
w, h = img.size

egg_transparent = Image.new("RGBA", (w, h), (0, 0, 0, 0))
cx, cy = w // 2, h // 2

for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        dist = math.sqrt((x - cx)**2 + (y - cy)**2)
        
        # Extract egg (radius 410)
        if dist < 410:
            is_purple = (b > g + 20 and r > g + 20 and b > 80)
            if is_purple:
                brightness = max(r, g, b)
                alpha = min(255, int(brightness * 1.2))
                egg_transparent.putpixel((x, y), (r, g, b, alpha))
            else:
                brightness = int(0.299 * r + 0.587 * g + 0.114 * b)
                if brightness > 15:
                    egg_transparent.putpixel((x, y), (255, 255, 255, brightness))

# Create the premium dark gradient background (Apple TV style)
# Top: #2C2D30 (44, 45, 48)
# Bottom: #131416 (19, 20, 22)
top_color = (44, 45, 48)
bottom_color = (19, 20, 22)

gradient_bg = Image.new("RGB", (w, h))
for y in range(h):
    ratio = y / (h - 1)
    r = int(top_color[0] * (1 - ratio) + bottom_color[0] * ratio)
    g = int(top_color[1] * (1 - ratio) + bottom_color[1] * ratio)
    b = int(top_color[2] * (1 - ratio) + bottom_color[2] * ratio)
    for x in range(w):
        gradient_bg.putpixel((x, y), (r, g, b))

# Composite the egg on top of the gradient
icon_1024 = Image.new("RGB", (w, h))
icon_1024.paste(gradient_bg, (0, 0))
icon_1024.paste(egg_transparent, (0, 0), egg_transparent)

# Generate other resized assets
favicon = icon_1024.resize((48, 48), Image.Resampling.LANCZOS)
android_bg = gradient_bg.resize((512, 512), Image.Resampling.LANCZOS)

# Foreground for Android adaptive (already transparent, we need to resize it to 512x512)
android_fg = egg_transparent.resize((512, 512), Image.Resampling.LANCZOS)

# Save to destination folders
for d in dest_dirs:
    os.makedirs(os.path.join(d, "images"), exist_ok=True)
    
    # Save standard icons
    icon_1024.save(os.path.join(d, "icon.png"), "PNG")
    icon_1024.save(os.path.join(d, "images", "icon.png"), "PNG")
    
    # Save favicon
    favicon.save(os.path.join(d, "favicon.png"), "PNG")
    
    # Save android adaptive background (the gradient itself!)
    android_bg.save(os.path.join(d, "android-icon-background.png"), "PNG")
    
    # Save android adaptive foreground (transparent egg)
    android_fg.save(os.path.join(d, "android-icon-foreground.png"), "PNG")

# Overwrite Xcode build icon
xcode_icon_path = "/Users/akshay/Documents/Build/FitApp/fitapp/ios/fitapp/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
icon_1024.save(xcode_icon_path, "PNG")
print("Saved all gradient assets and updated Xcode app icon!")
