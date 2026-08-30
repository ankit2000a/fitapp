const stripEmojis = (str) => {
  // Use modern unicode code points with /u flag
  return str.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]/gu, '').trim();
};

console.log("stripEmojis('Akshay Singh 🔥'):", stripEmojis('Akshay Singh 🔥'));
console.log("stripEmojis('akshaysingh78 👏'):", stripEmojis('akshaysingh78 👏'));
console.log("stripEmojis('Anonymous'):", stripEmojis('Anonymous'));
