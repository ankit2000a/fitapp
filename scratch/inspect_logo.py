from PIL import Image

img_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
img = Image.open(img_path)
w, h = img.size

print("Corners:")
print("Top-left (0,0):", img.getpixel((0, 0)))
print("Top-right (w-1,0):", img.getpixel((w-1, 0)))
print("Bottom-left (0,h-1):", img.getpixel((0, h-1)))
print("Bottom-right (w-1,h-1):", img.getpixel((w-1, h-1)))

print("\n10x10 Grid (sampled):")
for y in range(0, h, h//10):
    row = []
    for x in range(0, w, w//10):
        # average color around sample point for better view
        r, g, b = img.getpixel((x, y))
        # simplify color to make it easy to read: W (white), B (black/dark), O (other)
        if r > 240 and g > 240 and b > 240:
            char = "W"
        elif r < 20 and g < 20 and b < 20:
            char = "B"
        else:
            char = "."
        row.append(char)
    print(" ".join(row))
