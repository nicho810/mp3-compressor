import { useState, useRef, useCallback, useEffect } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { useI18n } from './useI18n'
import GithubLinkBanner from './vibe-design-system/components/GithubLinkBanner'

interface FileInfo {
  name: string
  size: number
  duration: number
  bitrate: number
  sampleRate: number
  channels: number
}

interface Preset {
  id: string
  nameKey: string
  descKey: string
  bitrate: number
  sampleRate: number | null
  channels: number | null
}

const presets: Preset[] = [
  { id: 'lossless', nameKey: 'presetLossless', descKey: 'presetLosslessDesc', bitrate: 320, sampleRate: null, channels: 2 },
  { id: 'high', nameKey: 'presetHigh', descKey: 'presetHighDesc', bitrate: 256, sampleRate: 44100, channels: 2 },
  { id: 'standard', nameKey: 'presetStandard', descKey: 'presetStandardDesc', bitrate: 192, sampleRate: 44100, channels: 2 },
  { id: 'medium', nameKey: 'presetMedium', descKey: 'presetMediumDesc', bitrate: 128, sampleRate: 44100, channels: 2 },
  { id: 'compact', nameKey: 'presetCompact', descKey: 'presetCompactDesc', bitrate: 96, sampleRate: 32000, channels: 2 },
  { id: 'voice', nameKey: 'presetVoice', descKey: 'presetVoiceDesc', bitrate: 64, sampleRate: 22050, channels: 1 },
  { id: 'minimal', nameKey: 'presetMinimal', descKey: 'presetMinimalDesc', bitrate: 32, sampleRate: 16000, channels: 1 },
  { id: 'custom', nameKey: 'presetCustom', descKey: 'presetCustomDesc', bitrate: 128, sampleRate: 44100, channels: 2 },
]

const bitrateOptions = [320, 256, 192, 160, 128, 112, 96, 80, 64, 48, 32]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function LanguageSelector() {
  const { language, setLanguage, languages } = useI18n()
  const [isOpen, setIsOpen] = useState(false)

  const currentLang = languages.find(l => l.code === language)

  return (
    <div className="language-selector">
      <button
        className={`language-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
      >
        <svg className="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span className="lang-name">{currentLang?.name}</span>
        <svg className={`chevron ${isOpen ? 'rotated' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div className={`language-dropdown ${isOpen ? 'show' : ''}`}>
        {languages.map(lang => (
          <button
            key={lang.code}
            className={`language-option ${lang.code === language ? 'active' : ''}`}
            onClick={() => {
              setLanguage(lang.code)
              setIsOpen(false)
            }}
          >
            {lang.code === language && (
              <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            )}
            <span>{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function App() {
  const { t } = useI18n()

  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('medium')
  const [customBitrate, setCustomBitrate] = useState<number>(128)
  const [customSampleRate, setCustomSampleRate] = useState<number>(44100)
  const [customChannels, setCustomChannels] = useState<number>(2)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [result, setResult] = useState<{ blob: Blob; size: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const sampleRateOptions = [
    { value: 48000, labelKey: 'sr48000' },
    { value: 44100, labelKey: 'sr44100' },
    { value: 32000, labelKey: 'sr32000' },
    { value: 22050, labelKey: 'sr22050' },
    { value: 16000, labelKey: 'sr16000' },
    { value: 11025, labelKey: 'sr11025' },
  ]

  const channelOptions = [
    { value: 2, labelKey: 'stereo' },
    { value: 1, labelKey: 'mono' },
  ]

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpegInstance = new FFmpeg()

        ffmpegInstance.on('progress', ({ progress, time }) => {
          setProgress(Math.round(progress * 100))
          if (time > 0) {
            setProgressText(`${t('processing')} ${formatDuration(time / 1000000)}`)
          }
        })

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        })

        setFfmpeg(ffmpegInstance)
        setLoaded(true)
      } catch (err) {
        console.error('Failed to load FFmpeg:', err)
        setError(t('loadEngineFailed'))
      } finally {
        setLoading(false)
      }
    }

    loadFFmpeg()
  }, [])

  // Parse audio file info
  const parseAudioInfo = useCallback((audioFile: File): Promise<FileInfo> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.src = URL.createObjectURL(audioFile)

      audio.onloadedmetadata = () => {
        const duration = audio.duration
        const bitrate = Math.round((audioFile.size * 8) / duration / 1000)

        // Create AudioContext to get detailed info
        const audioContext = new AudioContext()
        const reader = new FileReader()

        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

            resolve({
              name: audioFile.name,
              size: audioFile.size,
              duration,
              bitrate,
              sampleRate: audioBuffer.sampleRate,
              channels: audioBuffer.numberOfChannels,
            })

            audioContext.close()
          } catch {
            // Fallback if decodeAudioData fails
            resolve({
              name: audioFile.name,
              size: audioFile.size,
              duration,
              bitrate,
              sampleRate: 44100,
              channels: 2,
            })
          }
        }

        reader.onerror = () => reject(new Error(t('cannotReadFile')))
        reader.readAsArrayBuffer(audioFile)

        URL.revokeObjectURL(audio.src)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        reject(new Error(t('cannotParseAudio')))
      }
    })
  }, [t])

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.includes('audio') && !selectedFile.name.endsWith('.mp3')) {
      setError(t('pleaseSelectAudio'))
      return
    }

    setError(null)
    setResult(null)
    setFile(selectedFile)

    try {
      const info = await parseAudioInfo(selectedFile)
      setFileInfo(info)
    } catch (err) {
      setError(t('parseFileError') + ' ' + (err as Error).message)
    }
  }, [parseAudioInfo, t])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [handleFileSelect])

  const handleCompress = useCallback(async () => {
    if (!ffmpeg || !file || !loaded) return

    setProcessing(true)
    setProgress(0)
    setProgressText(t('preparing'))
    setError(null)

    try {
      const preset = presets.find(p => p.id === selectedPreset)!

      // Determine actual parameters
      const bitrate = selectedPreset === 'custom' ? customBitrate : preset.bitrate
      const sampleRate = selectedPreset === 'custom' ? customSampleRate : preset.sampleRate
      const channels = selectedPreset === 'custom' ? customChannels : preset.channels

      // Write input file
      await ffmpeg.writeFile('input.mp3', await fetchFile(file))

      // Build FFmpeg command
      const args = ['-i', 'input.mp3', '-b:a', `${bitrate}k`]

      if (sampleRate) {
        args.push('-ar', sampleRate.toString())
      }

      if (channels) {
        args.push('-ac', channels.toString())
      }

      args.push('-map', '0:a', '-y', 'output.mp3')

      // Run compression
      await ffmpeg.exec(args)

      // Read output file
      const data = await ffmpeg.readFile('output.mp3')
      const blob = new Blob([data], { type: 'audio/mp3' })

      setResult({
        blob,
        size: blob.size,
      })

      // Cleanup
      await ffmpeg.deleteFile('input.mp3')
      await ffmpeg.deleteFile('output.mp3')

    } catch (err) {
      console.error('Compression error:', err)
      setError(t('compressionFailed') + ' ' + (err as Error).message)
    } finally {
      setProcessing(false)
      setProgressText('')
    }
  }, [ffmpeg, file, loaded, selectedPreset, customBitrate, customSampleRate, customChannels, t])

  const handleDownload = useCallback(() => {
    if (!result || !file) return

    const preset = presets.find(p => p.id === selectedPreset)!
    const originalName = file.name.replace(/\.[^/.]+$/, '')
    const bitrate = selectedPreset === 'custom' ? customBitrate : preset.bitrate
    const fileName = `${originalName}_${bitrate}kbps.mp3`

    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [result, file, selectedPreset, customBitrate])

  const handleClear = useCallback(() => {
    setFile(null)
    setFileInfo(null)
    setResult(null)
    setError(null)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Keep handleClear available for future use
  void handleClear

  return (
    <>
      <div className="container">
        <div className="header">
          <h1>{t('title')}</h1>
          <LanguageSelector />
        </div>

        {/* Loading Status */}
        {loading && (
          <div className="loading-bar">
            <div className="loading-bar-inner">
              <div className="spinner-small"></div>
              <span>{t('loadingEngine')}</span>
            </div>
          </div>
        )}

      {/* Upload Area */}
      <div
        className={`upload-area ${dragging ? 'dragging' : ''} ${loading ? 'disabled' : ''}`}
        onClick={() => !loading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!loading) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { if (!loading) handleDrop(e); else { e.preventDefault(); setDragging(false) } }}
      >
        <div className="upload-icon">🎵</div>
        <button
          className="select-file-btn"
          onClick={(e) => { e.stopPropagation(); !loading && fileInputRef.current?.click() }}
          disabled={loading}
        >
          {t('selectFile')}
        </button>
        <div className="upload-text">{t('dragDropHint')}</div>
        {file && (
          <div className="selected-file-name" title={file.name}>
            {t('selectedFile')} {file.name}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mp3,audio/mpeg,.mp3"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />

      {/* File Info - Always visible */}
      <div className={`file-info ${!fileInfo ? 'disabled' : ''}`}>
        <h3>{t('fileInfo')}</h3>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">{t('fileName')}</div>
            <div className="info-value" style={{ fontSize: '14px' }} title={fileInfo?.name}>
              {fileInfo?.name ? (fileInfo.name.length > 20 ? fileInfo.name.slice(0, 20) + '...' : fileInfo.name) : '--'}
            </div>
          </div>
          <div className="info-item">
            <div className="info-label">{t('fileSize')}</div>
            <div className="info-value">{fileInfo ? formatFileSize(fileInfo.size) : '--'}</div>
          </div>
          <div className="info-item">
            <div className="info-label">{t('duration')}</div>
            <div className="info-value">{fileInfo ? formatDuration(fileInfo.duration) : '--'}</div>
          </div>
          <div className="info-item">
            <div className="info-label">{t('bitrate')}</div>
            <div className="info-value">{fileInfo ? `${fileInfo.bitrate} kbps` : '--'}</div>
          </div>
          <div className="info-item">
            <div className="info-label">{t('sampleRate')}</div>
            <div className="info-value">{fileInfo ? `${fileInfo.sampleRate} Hz` : '--'}</div>
          </div>
          <div className="info-item">
            <div className="info-label">{t('channels')}</div>
            <div className="info-value">{fileInfo ? (fileInfo.channels === 1 ? t('mono') : t('stereo')) : '--'}</div>
          </div>
        </div>
      </div>

      {/* Presets - Always visible */}
      <div className={`presets-section ${!file || result ? 'disabled' : ''}`}>
        <h3>{t('selectPreset')}</h3>
        <div className="presets-grid">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`preset-card ${selectedPreset === preset.id ? 'selected' : ''} ${!file || result ? 'disabled' : ''}`}
              onClick={() => file && !result && setSelectedPreset(preset.id)}
            >
              <div className="preset-name">{t(preset.nameKey)}</div>
              <div className="preset-desc">{t(preset.descKey)}</div>
            </div>
          ))}
        </div>

        {/* Custom Options */}
        {selectedPreset === 'custom' && (
          <div className="custom-options">
            <h4>{t('customParams')}</h4>
            <div className="custom-grid">
              <div className="custom-item">
                <label>{t('bitrate')}</label>
                <select
                  value={customBitrate}
                  onChange={(e) => setCustomBitrate(Number(e.target.value))}
                  disabled={!file || !!result}
                >
                  {bitrateOptions.map((br) => (
                    <option key={br} value={br}>{br} kbps</option>
                  ))}
                </select>
              </div>
              <div className="custom-item">
                <label>{t('sampleRate')}</label>
                <select
                  value={customSampleRate}
                  onChange={(e) => setCustomSampleRate(Number(e.target.value))}
                  disabled={!file || !!result}
                >
                  {sampleRateOptions.map((sr) => (
                    <option key={sr.value} value={sr.value}>{t(sr.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div className="custom-item">
                <label>{t('channels')}</label>
                <select
                  value={customChannels}
                  onChange={(e) => setCustomChannels(Number(e.target.value))}
                  disabled={!file || !!result}
                >
                  {channelOptions.map((ch) => (
                    <option key={ch.value} value={ch.value}>{t(ch.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {processing && (
        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="progress-text">{progressText || `${progress}%`}</div>
        </div>
      )}

      {/* Estimated Size */}
      {file && fileInfo && !result && !processing && (() => {
        const preset = presets.find(p => p.id === selectedPreset)!
        const bitrate = selectedPreset === 'custom' ? customBitrate : preset.bitrate
        const estimatedSize = Math.round(bitrate * 125 * fileInfo.duration)
        const compressionRatio = Math.round((1 - estimatedSize / fileInfo.size) * 100)
        return (
          <div className="estimate-info">
            <span>{t('estimatedSize')} <strong>{formatFileSize(estimatedSize)}</strong></span>
            <span>{t('compressionRatio')} <strong className={compressionRatio > 0 ? 'positive' : 'negative'}>{compressionRatio > 0 ? `-${compressionRatio}%` : `+${Math.abs(compressionRatio)}%`}</strong></span>
          </div>
        )
      })()}

      {/* Compress Button */}
      {file && !result && (
        <button
          className="compress-btn"
          onClick={handleCompress}
          disabled={processing || !loaded}
        >
          {processing ? t('compressing') : t('startCompress')}
        </button>
      )}

      {/* Result */}
      {result && fileInfo && (
        <div className="result-section">
          <div className="result-header">
            <div className="success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3>{t('compressionComplete')}</h3>
          </div>
          <div className="result-stats">
            <div className="stat-item">
              <div className="stat-label">{t('originalSize')}</div>
              <div className="stat-value">{formatFileSize(fileInfo.size)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">{t('compressedSize')}</div>
              <div className="stat-value">{formatFileSize(result.size)}</div>
            </div>
            <div className="stat-item">
              {(() => {
                const saved = Math.round((1 - result.size / fileInfo.size) * 100)
                return saved >= 0 ? (
                  <>
                    <div className="stat-label">{t('saved')}</div>
                    <div className="stat-value highlight">{saved}%</div>
                  </>
                ) : (
                  <>
                    <div className="stat-label">{t('increased')}</div>
                    <div className="stat-value negative">{Math.abs(saved)}%</div>
                  </>
                )
              })()}
            </div>
          </div>
          <div className="result-buttons">
            <button className="redo-btn" onClick={() => setResult(null)}>
              {t('recompress')}
            </button>
            <button className="download-btn" onClick={handleDownload}>
              {t('download')}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">{error}</div>
      )}

        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>

      <GithubLinkBanner
        href="https://github.com/nicho810/mp3-compressor"
        label={t('viewOnGithub')}
        repo="nicho810/mp3-compressor"
      />
    </>
  )
}

export default App
