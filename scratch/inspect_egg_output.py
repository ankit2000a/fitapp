from PIL import Image

img = Image.open("/Users/akshay/Documents/Build/FitApp/scratch/logo_egg_test.png")
w, h = img.size

# Let's find the bounding box of non-transparent pixels
bbox = img.getbbox()
print("Bounding box of egg:", bbox)

# Let's inspect the corner pixels to make sure they are transparent
corners = [
    (0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
    (100, 100), (w-101, 100), (100, h-101), (w-101, h-101)
]
for x, y in corners:
    print(f"Pixel ({x}, {y}) alpha:", img.getpixel((x, y))[3])

# Let's print the colors of some pixels along the center horizontal line
cy = h // 2
row_alphas = [img.getpixel((x, cy))[3] for x in range(w)]
# Let's print where it goes from transparent to opaque
transitions = []
for x in range(1, w):
    if (row_alphas[x-1] == 0 and row_alphas[x] > 0) or (row_alphas[x-1] > 0 and row_alphas[x] == 0):
        transitions.append((x, row_alphas[x]))
print("Transitions on horizontal center line:", transitions)
