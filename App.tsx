import AsyncStorage from '@react-native-async-storage/async-storage';
import { pick, types } from '@react-native-documents/picker';
import { viewDocument } from '@react-native-documents/viewer';
import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type FolderType = 'Fotos' | 'Videos' | 'Documentos';

type VaultItem = {
  id: string;
  folder: FolderType;
  name: string;
  size: number | null;
  uri: string;
  mimeType: string | null;
};

const STORAGE_KEY = '@appbio/vault-items';
const folders: Array<{
  name: FolderType;
  symbol: string;
  color: string;
  description: string;
}> = [
  {
    name: 'Fotos',
    symbol: '▧',
    color: '#C9D9D2',
    description: 'Imágenes guardadas',
  },
  {
    name: 'Videos',
    symbol: '▶',
    color: '#C9D3E2',
    description: 'Videos guardados',
  },
  {
    name: 'Documentos',
    symbol: '▤',
    color: '#DED2C4',
    description: 'Archivos y documentos',
  },
];

const pickerTypes: Record<FolderType, string | string[]> = {
  Fotos: types.images,
  Videos: types.video,
  Documentos: [
    types.pdf,
    types.doc,
    types.docx,
    types.plainText,
    types.xls,
    types.xlsx,
    types.ppt,
    types.pptx,
  ],
};

function App() {
  const biometrics = useRef(new ReactNativeBiometrics()).current;
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometría');
  const [notice, setNotice] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [hasLoadedItems, setHasLoadedItems] = useState(false);
  const [activeFolder, setActiveFolder] = useState<FolderType | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [selectedImage, setSelectedImage] = useState<VaultItem | null>(null);

  useEffect(() => {
    const checkBiometrics = async () => {
      try {
        const result = await biometrics.isSensorAvailable();
        setBiometricAvailable(result.available);
        if (result.biometryType === 'FaceID') setBiometricLabel('Face ID');
        if (result.biometryType === 'TouchID') {
          setBiometricLabel('Huella dactilar');
        }
        if (result.biometryType === 'Biometrics') {
          setBiometricLabel('Biometría del dispositivo');
        }
        if (!result.available) {
          setNotice(
            result.error ||
              'Configura una huella o rostro en el dispositivo para abrir la bóveda.',
          );
        }
      } catch {
        setNotice('No fue posible consultar la biometría del dispositivo.');
      } finally {
        setIsChecking(false);
      }
    };
    checkBiometrics();
  }, [biometrics]);

  useEffect(() => {
    const loadItems = async () => {
      try {
        const savedItems = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedItems) setItems(JSON.parse(savedItems) as VaultItem[]);
      } catch {
        setNotice('No fue posible cargar los archivos guardados.');
      } finally {
        setHasLoadedItems(true);
      }
    };
    loadItems();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isUnlocked && activeFolder) {
          setActiveFolder(null);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [activeFolder, isUnlocked]);

  useEffect(() => {
    if (!hasLoadedItems) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {
      setNotice('No fue posible guardar los cambios de la bóveda.');
    });
  }, [hasLoadedItems, items]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        setIsUnlocked(false);
        setActiveFolder(null);
      }
    });
    return () => subscription.remove();
  }, []);

  const unlockVault = async () => {
    if (!biometricAvailable || isAuthenticating) return;
    setIsAuthenticating(true);
    setNotice('');
    try {
      const result = await biometrics.simplePrompt({
        promptMessage: 'Confirma tu identidad para abrir la bóveda',
        fallbackPromptMessage: 'Usar código del dispositivo',
        cancelButtonText: 'Cancelar',
      });
      if (result.success) setIsUnlocked(true);
      else setNotice('La bóveda sigue bloqueada.');
    } catch {
      setNotice('No se pudo validar la biometría. Intenta de nuevo.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const addFiles = async (folder: FolderType) => {
    if (isPicking) return;
    setIsPicking(true);
    setNotice('');
    try {
      const selectedFiles = await pick({
        mode: 'open',
        requestLongTermAccess: true,
        type: pickerTypes[folder],
        allowMultiSelection: true,
      });
      const validFiles = selectedFiles.filter(
        file => !file.error && file.hasRequestedType,
      );

      if (validFiles.length === 0) {
        setNotice('Selecciona archivos que correspondan a esta carpeta.');
        return;
      }

      const newItems: VaultItem[] = validFiles.map(file => ({
        id: `${Date.now()}-${file.uri}`,
        folder,
        name: file.name || 'Archivo sin nombre',
        size: file.size,
        uri: file.uri,
        mimeType: file.type,
      }));
      setItems(current => [...newItems, ...current]);
      setNotice(
        `${newItems.length} ${
          newItems.length === 1 ? 'archivo guardado.' : 'archivos guardados.'
        }`,
      );
    } catch {
      // Closing the native picker is not an error the user needs to see.
    } finally {
      setIsPicking(false);
    }
  };

  const openFile = async (item: VaultItem) => {
    if (item.folder === 'Fotos') {
      setSelectedImage(item);
      return;
    }

    try {
      await viewDocument({
        uri: item.uri,
        mimeType: item.mimeType || undefined,
        grantPermissions: 'read',
      });
    } catch {
      setNotice(
        'No se encontró una aplicación compatible para abrir este archivo.',
      );
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.app}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>Bóveda</Text>
              <Text style={styles.subtitle}>Tus archivos personales</Text>
            </View>
            {isUnlocked && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bloquear bóveda"
                onPress={() => {
                  setIsUnlocked(false);
                  setActiveFolder(null);
                }}
                style={styles.lockButton}
              >
                <Text style={styles.lockButtonText}>Bloquear</Text>
              </Pressable>
            )}
          </View>

          {isUnlocked ? (
            <VaultContent
              activeFolder={activeFolder}
              isPicking={isPicking}
              items={items}
              notice={notice}
              onAddFiles={addFiles}
              onCloseFolder={() => setActiveFolder(null)}
              onOpenFile={openFile}
              onOpenFolder={setActiveFolder}
            />
          ) : (
            <LockedContent
              biometricAvailable={biometricAvailable}
              biometricLabel={biometricLabel}
              isChecking={isChecking}
              isAuthenticating={isAuthenticating}
              notice={notice}
              onUnlock={unlockVault}
            />
          )}
        </View>
        <Modal
          animationType="fade"
          visible={selectedImage !== null}
          onRequestClose={() => setSelectedImage(null)}
        >
          <SafeAreaView style={styles.previewScreen}>
            <View style={styles.previewHeader}>
              <Text numberOfLines={1} style={styles.previewTitle}>
                {selectedImage?.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar imagen"
                onPress={() => setSelectedImage(null)}
                style={styles.previewCloseButton}
              >
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </Pressable>
            </View>
            {selectedImage && (
              <Image
                accessibilityLabel={selectedImage.name}
                resizeMode="contain"
                source={{ uri: selectedImage.uri }}
                style={styles.previewImage}
              />
            )}
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function LockedContent({
  biometricAvailable,
  biometricLabel,
  isChecking,
  isAuthenticating,
  notice,
  onUnlock,
}: {
  biometricAvailable: boolean;
  biometricLabel: string;
  isChecking: boolean;
  isAuthenticating: boolean;
  notice: string;
  onUnlock: () => void;
}) {
  return (
    <View style={styles.lockedContent}>
      <View style={styles.lockMark}>
        <View style={styles.lockShackle} />
        <View style={styles.lockBody} />
      </View>
      <Text style={styles.lockedTitle}>Contenido protegido</Text>
      <Text style={styles.lockedDescription}>
        Tus carpetas se muestran solo después de validar tu identidad.
      </Text>
      <View style={styles.securityNote}>
        <Text style={styles.securityNoteTitle}>
          {isChecking ? 'Revisando biometría…' : biometricLabel}
        </Text>
        <Text style={styles.securityNoteText}>
          {biometricAvailable
            ? 'Usa la biometría configurada en este dispositivo.'
            : 'No hay biometría disponible todavía.'}
        </Text>
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Desbloquear bóveda con biometría"
        disabled={!biometricAvailable || isAuthenticating || isChecking}
        onPress={onUnlock}
        style={({ pressed }) => [
          styles.unlockButton,
          (!biometricAvailable || isAuthenticating || isChecking) &&
            styles.unlockButtonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.unlockButtonText}>
          {isAuthenticating ? 'Validando…' : 'Desbloquear con biometría'}
        </Text>
      </Pressable>
      <Text style={styles.lockedFootnote}>
        La bóveda se bloquea al enviar la aplicación a segundo plano.
      </Text>
    </View>
  );
}

function VaultContent({
  activeFolder,
  isPicking,
  items,
  notice,
  onAddFiles,
  onCloseFolder,
  onOpenFile,
  onOpenFolder,
}: {
  activeFolder: FolderType | null;
  isPicking: boolean;
  items: VaultItem[];
  notice: string;
  onAddFiles: (folder: FolderType) => void;
  onCloseFolder: () => void;
  onOpenFile: (item: VaultItem) => void;
  onOpenFolder: (folder: FolderType) => void;
}) {
  if (activeFolder) {
    const folder = folders.find(item => item.name === activeFolder)!;
    const folderItems = items.filter(item => item.folder === activeFolder);
    return (
      <ScrollView contentContainerStyle={styles.vaultContent}>
        <Pressable onPress={onCloseFolder} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Carpetas</Text>
        </Pressable>
        <View style={styles.folderTitleRow}>
          <View
            style={[styles.folderIconLarge, { backgroundColor: folder.color }]}
          >
            <Text style={styles.folderIconText}>{folder.symbol}</Text>
          </View>
          <View>
            <Text style={styles.vaultTitle}>{activeFolder}</Text>
            <Text style={styles.vaultDescription}>{folder.description}</Text>
          </View>
        </View>
        <Pressable
          disabled={isPicking}
          onPress={() => onAddFiles(activeFolder)}
          style={[
            styles.addFileButton,
            isPicking && styles.addFileButtonDisabled,
          ]}
        >
          <Text style={styles.addFileButtonText}>
            {isPicking ? 'Abriendo selector…' : '+ Seleccionar archivos'}
          </Text>
        </Pressable>
        {!!notice && <Text style={styles.vaultNotice}>{notice}</Text>}
        <Text style={styles.itemCount}>
          {folderItems.length}{' '}
          {folderItems.length === 1 ? 'archivo guardado' : 'archivos guardados'}
        </Text>
        {folderItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Esta carpeta está vacía</Text>
            <Text style={styles.emptyText}>
              Selecciona archivos desde tu dispositivo para guardarlos aquí.
            </Text>
          </View>
        ) : (
          folderItems.map(item => (
            <FileRow
              item={item}
              key={item.id}
              onOpen={() => onOpenFile(item)}
            />
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.vaultContent}>
      <View style={styles.vaultIntro}>
        <Text style={styles.vaultTitle}>Carpetas</Text>
        <Text style={styles.vaultDescription}>
          Selecciona una carpeta para ver o guardar archivos.
        </Text>
      </View>
      {folders.map(folder => {
        const count = items.filter(item => item.folder === folder.name).length;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir carpeta ${folder.name}`}
            key={folder.name}
            onPress={() => onOpenFolder(folder.name)}
            style={({ pressed }) => [
              styles.folderCard,
              pressed && styles.buttonPressed,
            ]}
          >
            <View
              style={[styles.folderIcon, { backgroundColor: folder.color }]}
            >
              <Text style={styles.folderIconText}>{folder.symbol}</Text>
            </View>
            <View style={styles.folderText}>
              <Text style={styles.folderName}>{folder.name}</Text>
              <Text style={styles.folderDescription}>{folder.description}</Text>
            </View>
            <Text style={styles.folderCount}>{count}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}
      {!!notice && <Text style={styles.vaultNotice}>{notice}</Text>}
    </ScrollView>
  );
}

function FileRow({ item, onOpen }: { item: VaultItem; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.fileRow, pressed && styles.buttonPressed]}
    >
      <View style={styles.fileIcon}>
        <Text style={styles.fileIconText}>▤</Text>
      </View>
      <View style={styles.fileText}>
        <Text numberOfLines={1} style={styles.fileName}>
          {item.name}
        </Text>
        <Text style={styles.fileDetail}>{formatSize(item.size)}</Text>
      </View>
    </Pressable>
  );
}

function formatSize(size: number | null) {
  if (!size) return 'Archivo seleccionado';
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F6F2' },
  app: { flex: 1, backgroundColor: '#F7F6F2' },
  header: {
    alignItems: 'center',
    borderBottomColor: '#E6E2DB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  brand: {
    color: '#252421',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: { color: '#6C6962', fontSize: 13, marginTop: 2 },
  lockButton: {
    borderColor: '#C9C5BD',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lockButtonText: { color: '#3D3B36', fontSize: 13, fontWeight: '600' },
  lockedContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 58,
    paddingHorizontal: 32,
  },
  lockMark: {
    alignItems: 'center',
    height: 90,
    justifyContent: 'flex-end',
    marginBottom: 26,
    width: 78,
  },
  lockShackle: {
    borderColor: '#393834',
    borderRadius: 20,
    borderWidth: 7,
    height: 48,
    position: 'absolute',
    top: 0,
    width: 42,
  },
  lockBody: {
    backgroundColor: '#393834',
    borderRadius: 8,
    height: 50,
    width: 66,
  },
  lockedTitle: {
    color: '#252421',
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  lockedDescription: {
    color: '#6C6962',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  securityNote: {
    backgroundColor: '#ECEAE4',
    borderRadius: 10,
    marginTop: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  securityNoteTitle: { color: '#34332F', fontSize: 14, fontWeight: '700' },
  securityNoteText: {
    color: '#6C6962',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  notice: {
    color: '#9A473B',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  unlockButton: {
    alignItems: 'center',
    backgroundColor: '#2F4D45',
    borderRadius: 9,
    marginTop: 22,
    paddingVertical: 15,
    width: '100%',
  },
  unlockButtonDisabled: { backgroundColor: '#A6AAA4' },
  unlockButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  buttonPressed: { opacity: 0.84 },
  lockedFootnote: {
    color: '#85817A',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 18,
    textAlign: 'center',
  },
  vaultContent: { padding: 24, paddingBottom: 40 },
  vaultIntro: { marginBottom: 20 },
  vaultTitle: {
    color: '#252421',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  vaultDescription: { color: '#6C6962', fontSize: 14, marginTop: 5 },
  folderCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E3DC',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 11,
    padding: 14,
  },
  folderIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  folderIconLarge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    marginRight: 13,
    width: 54,
  },
  folderIconText: { color: '#3D3B36', fontSize: 22, fontWeight: '700' },
  folderText: { flex: 1, marginLeft: 13 },
  folderName: { color: '#302F2B', fontSize: 16, fontWeight: '700' },
  folderDescription: { color: '#7C7871', fontSize: 12, marginTop: 3 },
  folderCount: { color: '#7C7871', fontSize: 13, marginRight: 10 },
  chevron: { color: '#6C6962', fontSize: 23, fontWeight: '300' },
  backButton: { alignSelf: 'flex-start', marginBottom: 20, paddingVertical: 4 },
  backButtonText: { color: '#2F4D45', fontSize: 14, fontWeight: '700' },
  folderTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 22,
  },
  addFileButton: {
    alignItems: 'center',
    backgroundColor: '#2F4D45',
    borderRadius: 9,
    paddingVertical: 14,
  },
  addFileButtonDisabled: { backgroundColor: '#A6AAA4' },
  addFileButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  vaultNotice: {
    color: '#6D5441',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  itemCount: {
    color: '#7C7871',
    fontSize: 13,
    marginBottom: 10,
    marginTop: 22,
  },
  emptyState: {
    backgroundColor: '#ECEAE4',
    borderRadius: 10,
    marginTop: 4,
    padding: 18,
  },
  emptyTitle: { color: '#3D3B36', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#6C6962', fontSize: 13, lineHeight: 19, marginTop: 5 },
  fileRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E3DC',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 9,
    padding: 12,
  },
  fileIcon: {
    alignItems: 'center',
    backgroundColor: '#E6E2DB',
    borderRadius: 7,
    height: 39,
    justifyContent: 'center',
    width: 39,
  },
  fileIconText: { color: '#54514B', fontSize: 18 },
  fileText: { flex: 1, marginLeft: 12 },
  fileName: { color: '#302F2B', fontSize: 14, fontWeight: '600' },
  fileDetail: { color: '#7C7871', fontSize: 12, marginTop: 3 },
  previewScreen: { backgroundColor: '#1B1B19', flex: 1 },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  previewTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  previewCloseButton: {
    borderColor: '#96938C',
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  previewCloseText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  previewImage: { flex: 1, width: '100%' },
});

export default App;
