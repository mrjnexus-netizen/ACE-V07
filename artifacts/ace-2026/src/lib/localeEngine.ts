type Locale = "en" | "es" | "fr" | "de" | "ja" | "zh";

const dictionary: Record<Locale, Record<string, string>> = {
  en: {
    "hello": "Hello",
    "welcome": "Welcome",
    "button.click": "Click Me",
    "error.generic": "An error occurred",
  },
  es: {
    "hello": "Hola",
    "welcome": "Bienvenido",
    "button.click": "Haz clic aquí",
    "error.generic": "Ocurrió un error",
  },
  fr: {
    "hello": "Bonjour",
    "welcome": "Bienvenue",
    "button.click": "Cliquez ici",
    "error.generic": "Une erreur est survenue",
  },
  de: {
    "hello": "Hallo",
    "welcome": "Willkommen",
    "button.click": "Klicken Sie hier",
    "error.generic": "Ein Fehler ist aufgetreten",
  },
  ja: {
    "hello": "こんにちは",
    "welcome": "ようこそ",
    "button.click": "クリックして下さい",
    "error.generic": "エラーが発生しました",
  },
  zh: {
    "hello": "你好",
    "welcome": "欢迎",
    "button.click": "点击我",
    "error.generic": "发生了一个错误",
  },
};

export const getTranslation = (key: string, locale: Locale): string => {
  if (dictionary[locale] && dictionary[locale][key]) {
    return dictionary[locale][key];
  }
  if (dictionary.en[key]) {
    return dictionary.en[key];
  }
  return key;
};

export const applyLocaleTypography = (locale: Locale, root: HTMLElement) => {
  switch (locale) {
    case "en":
    case "es":
    case "fr":
    case "de":
      root.style.setProperty("--font-family", "Arial, sans-serif");
      root.style.setProperty("--letter-spacing", "normal");
      root.style.setProperty("--line-height", "normal");
      break;
    case "ja":
    case "zh":
      root.style.setProperty("--font-family", "\"Noto Sans JP\", sans-serif");
      root.style.setProperty("--letter-spacing", "0.05em");
      root.style.setProperty("--line-height", "1.5");
      break;
    default:
      root.style.setProperty("--font-family", "Arial, sans-serif");
      root.style.setProperty("--letter-spacing", "normal");
      root.style.setProperty("--line-height", "normal");
      break;
  }
};

export const getTextDirection = (locale: Locale): "ltr" | "rtl" => {
  return "ltr";
};
