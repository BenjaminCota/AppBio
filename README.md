# Bóveda biométrica

Aplicación React Native para mantener fotos, videos y documentos dentro de una
bóveda protegida por la biometría del dispositivo.

## Funciones

- Verifica que exista biometría disponible antes de permitir el acceso.
- Abre el diálogo biométrico nativo: huella o rostro en Android y Face ID /
  Touch ID en iOS.
- Muestra los elementos guardados únicamente después de una validación exitosa.
- Permite filtrar fotos, videos y documentos, y registrar nuevos elementos.
- Vuelve a bloquear la bóveda al enviarse la app a segundo plano o al tocar
  **Bloquear**.

La autenticación se implementa con `react-native-biometrics`, un puente nativo
que usa `BiometricPrompt` de Android y Face ID / Touch ID en iOS. En Android se
declaran los permisos `USE_BIOMETRIC` y `USE_FINGERPRINT`; en iOS se incluyó la
descripción de uso de Face ID en `Info.plist`.

## Ejecutar en Android

Usa tres terminales en la raíz del proyecto:

```powershell
emulator -avd Pixel_10
```

```powershell
npm start
```

```powershell
npm run android
```

Antes de abrir la bóveda, registra una huella o rostro en los ajustes de
seguridad del emulador. Cuando se muestre el diálogo nativo, valida la huella
desde los controles extendidos del emulador o con el comando `adb emu finger
touch <id>` (donde `<id>` corresponde a una huella registrada).

## Verificación

```powershell
npx tsc --noEmit
npm test -- --runInBand
npm run lint
```
