# Grafik zmian – wersja na telefon (aplikacja webowa)

Aplikacja działa w przeglądarce i bez internetu. Dane zapisują się tylko na urządzeniu.
Plik `grafik.json` (Menu ⋯ → Eksport / Import) ma ten sam format co program Grafik na Windowsie.

## Instalacja na iPhonie
1. Otwórz adres strony w **Safari**.
2. Stuknij **Udostępnij** → **Do ekranu początkowego** → **Dodaj**.

## Publikacja na GitHub Pages
1. Utwórz publiczne repozytorium (np. `grafik`) na github.com.
2. Wgraj zawartość tego folderu (wszystkie pliki i folder `icons`) do głównego katalogu repozytorium.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
4. Po chwili strona będzie pod adresem `https://<twoja-nazwa>.github.io/grafik/`.

## Nowa wersja
Po zmianach w plikach podnieś numer `CACHE` w `sw.js` (i `VERSION` w `app.js`),
żeby telefony pobrały nową wersję.
