from PIL import Image
import os
import math

img_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
img = Image.open(img_path)
w, h = img.size

dest_dirs = [
    "/Users/akshay/Documents/Build/FitApp/assets",
    "/Users/akshay/Documents/Build/FitApp/fitapp/assets"
]

# Create output image with transparency
out = Image.new("RGBA", (w, h), (0, 0, 0, 0))

cx, cy = w // 2, h // 2

for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        dist = math.sqrt((x - cx)**2 + (y - cy)**2)
        
        # We only look at the region of the egg (radius 410 from center)
        if dist < 410:
            is_purple = (b > g + 20 and r > g + 20 and b > 80)
            
            if is_purple:
                brightness = max(r, g, b)
                alpha = min(255, int(brightness * 1.2))
                out.putpixel((x, y), (r, g, b, alpha))
            else:
                brightness = int(0.299 * r + 0.587 * g + 0.114 * b)
                if brightness > 15: # threshold to remove noise in black background
                    out.putpixel((x, y), (255, 255, 255, brightness))

# Save to destination folders
for d in dest_dirs:
    os.makedirs(os.path.join(d, "images"), exist_ok=True)
    out_path = os.path.join(d, "images", "logo-egg.png")
    out.save(out_path, "PNG")
    print(f"Saved logo-egg.png to {out_path}")
