import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.dkbikonstrykt.kip',
  appName: 'КИП Спецтехника',
  webDir: 'dist',
  android: {
    // Бэк ходит по HTTPS — смешанный контент не нужен.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

// ВАЖНО для APK: веб-ассеты зашиты в приложение и работают с origin
// https://localhost, поэтому относительные `/api/...` не сработают.
// APK нужно собирать с VITE_API_BASE_URL = абсолютный адрес бэка
// (напр. https://api.kip.dkbikonstrykt.ru). Для PWA остаётся пустым.

export default config;
