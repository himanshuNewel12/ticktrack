const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'node_modules', 'expo-router', 'assets');
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const dummyXml = '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"></vector>';

const files = [
  'unmatched.png',
  'error.png',
  'logotype.png',
  'arrow_right.xml',
  'checkmark.xml',
  'react-navigation/drawer/toggle-drawer-icon.png',
  'react-navigation/elements/back-icon-mask.png',
  'react-navigation/elements/back-icon.png',
  'react-navigation/elements/clear-icon.png',
  'react-navigation/elements/close-icon.png',
  'react-navigation/elements/search-icon.png'
];

files.forEach(f => {
  const fullPath = path.join(baseDir, f);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  if (!fs.existsSync(fullPath)) {
    if (f.endsWith('.png')) {
      fs.writeFileSync(fullPath, png1x1);
    } else {
      fs.writeFileSync(fullPath, dummyXml, 'utf8');
    }
    console.log('Ensured asset:', f);
  }
});
