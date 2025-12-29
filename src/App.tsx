import { useState, useRef, useCallback, useEffect } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

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
  name: string
  description: string
  bitrate: string
  bitrateKbps: number
}

const presets: Preset[] = [
  { id: 'high', name: '高品质', description: '适合音乐收藏', bitrate: '192k', bitrateKbps: 192 },
  { id: 'medium', name: '标准品质', description: '平衡大小和音质', bitrate: '128k', bitrateKbps: 128 },
  { id: 'low', name: '省空间', description: '适合语音/播客', bitrate: '96k', bitrateKbps: 96 },
  { id: 'min', name: '极限压缩', description: '最小文件体积', bitrate: '64k', bitrateKbps: 64 },
]

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

function App() {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('medium')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [result, setResult] = useState<{ blob: Blob; size: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpegInstance = new FFmpeg()

        ffmpegInstance.on('progress', ({ progress, time }) => {
          setProgress(Math.round(progress * 100))
          if (time > 0) {
            setProgressText(`处理中... ${formatDuration(time / 1000000)}`)
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
        setError('加载音频处理引擎失败，请刷新页面重试')
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

        reader.onerror = () => reject(new Error('无法读取文件'))
        reader.readAsArrayBuffer(audioFile)

        URL.revokeObjectURL(audio.src)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        reject(new Error('无法解析音频文件'))
      }
    })
  }, [])

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.includes('audio') && !selectedFile.name.endsWith('.mp3')) {
      setError('请选择音频文件')
      return
    }

    setError(null)
    setResult(null)
    setFile(selectedFile)

    try {
      const info = await parseAudioInfo(selectedFile)
      setFileInfo(info)
    } catch (err) {
      setError('无法解析文件信息: ' + (err as Error).message)
    }
  }, [parseAudioInfo])

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
    setProgressText('准备中...')
    setError(null)

    try {
      const preset = presets.find(p => p.id === selectedPreset)!

      // Write input file
      await ffmpeg.writeFile('input.mp3', await fetchFile(file))

      // Run compression
      await ffmpeg.exec([
        '-i', 'input.mp3',
        '-b:a', preset.bitrate,
        '-map', '0:a',
        '-y',
        'output.mp3'
      ])

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
      setError('压缩失败: ' + (err as Error).message)
    } finally {
      setProcessing(false)
      setProgressText('')
    }
  }, [ffmpeg, file, loaded, selectedPreset])

  const handleDownload = useCallback(() => {
    if (!result || !file) return

    const preset = presets.find(p => p.id === selectedPreset)!
    const originalName = file.name.replace(/\.[^/.]+$/, '')
    const fileName = `${originalName}_${preset.name}.mp3`

    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [result, file, selectedPreset])

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

  if (loading) {
    return (
      <div className="container">
        <h1>MP3 压缩工具</h1>
        <div className="loading-section">
          <div className="spinner"></div>
          <p>正在加载音频处理引擎...</p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
            首次加载可能需要几秒钟
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>MP3 压缩工具</h1>

      {/* Upload Area */}
      {!file && (
        <div
          className={`upload-area ${dragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="upload-icon">🎵</div>
          <div className="upload-text">点击或拖拽上传 MP3 文件</div>
          <div className="upload-hint">支持 MP3 格式音频文件</div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mp3,audio/mpeg,.mp3"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />

      {/* File Info */}
      {fileInfo && (
        <div className="file-info">
          <h3>📄 文件信息</h3>
          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">文件名</div>
              <div className="info-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                {fileInfo.name}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">文件大小</div>
              <div className="info-value">{formatFileSize(fileInfo.size)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">时长</div>
              <div className="info-value">{formatDuration(fileInfo.duration)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">比特率</div>
              <div className="info-value">{fileInfo.bitrate} kbps</div>
            </div>
            <div className="info-item">
              <div className="info-label">采样率</div>
              <div className="info-value">{fileInfo.sampleRate} Hz</div>
            </div>
            <div className="info-item">
              <div className="info-label">声道</div>
              <div className="info-value">{fileInfo.channels === 1 ? '单声道' : '立体声'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Presets */}
      {file && !result && (
        <div className="presets-section">
          <h3>选择压缩预设</h3>
          <div className="presets-grid">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`preset-card ${selectedPreset === preset.id ? 'selected' : ''}`}
                onClick={() => setSelectedPreset(preset.id)}
              >
                <div className="preset-name">{preset.name}</div>
                <div className="preset-desc">{preset.description}</div>
                <div className="preset-bitrate">{preset.bitrateKbps} kbps</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="progress-text">{progressText || `${progress}%`}</div>
        </div>
      )}

      {/* Compress Button */}
      {file && !result && (
        <button
          className="compress-btn"
          onClick={handleCompress}
          disabled={processing || !loaded}
        >
          {processing ? '压缩中...' : '开始压缩'}
        </button>
      )}

      {/* Result */}
      {result && fileInfo && (
        <div className="result-section">
          <h3>✅ 压缩完成</h3>
          <div className="result-stats">
            <div className="stat-item">
              <div className="stat-label">原始大小</div>
              <div className="stat-value">{formatFileSize(fileInfo.size)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">压缩后</div>
              <div className="stat-value">{formatFileSize(result.size)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">节省</div>
              <div className="stat-value highlight">
                {Math.round((1 - result.size / fileInfo.size) * 100)}%
              </div>
            </div>
          </div>
          <button className="download-btn" onClick={handleDownload}>
            下载压缩文件
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* Clear Button */}
      {file && (
        <button className="clear-btn" onClick={handleClear}>
          重新选择文件
        </button>
      )}

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  )
}

export default App
