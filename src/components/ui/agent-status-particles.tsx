"use client"

import { useEffect, useRef } from "react"

interface SpherePoint {
  x: number
  y: number
  z: number
  baseX: number
  baseY: number
  baseZ: number
  size: number
  brightness: number
}

interface BrainPoint {
  x: number
  y: number
  z: number
  size: number
  pulseOffset: number
}

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  twinkleSpeed: number
  twinklePhase: number
}

interface AgentStatusParticlesProps {
  isLive?: boolean
  className?: string
}

export function AgentStatusParticles({ isLive = true, className }: AgentStatusParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const isLiveRef = useRef(isLive)
  const spherePointsRef = useRef<SpherePoint[]>([])
  const brainPointsRef = useRef<BrainPoint[]>([])
  const starsRef = useRef<Star[]>([])
  const rotationRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    isLiveRef.current = isLive
  }, [isLive])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const initScene = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      const sphereRadius = Math.min(canvas.width, canvas.height) * 0.22
      
      // Create outer sphere points
      const spherePoints: SpherePoint[] = []
      const pointCount = 250
      
      for (let i = 0; i < pointCount; i++) {
        const phi = Math.acos(-1 + (2 * i) / pointCount)
        const theta = Math.sqrt(pointCount * Math.PI) * phi
        
        const x = sphereRadius * Math.cos(theta) * Math.sin(phi)
        const y = sphereRadius * Math.sin(theta) * Math.sin(phi)
        const z = sphereRadius * Math.cos(phi)
        
        spherePoints.push({
          x, y, z,
          baseX: x, baseY: y, baseZ: z,
          size: Math.random() * 0.5 + 0.3,
          brightness: Math.random() * 0.4 + 0.6,
        })
      }
      
      // Add latitude/longitude grid points
      for (let lat = -80; lat <= 80; lat += 20) {
        for (let lon = 0; lon < 360; lon += 15) {
          const latRad = (lat * Math.PI) / 180
          const lonRad = (lon * Math.PI) / 180
          
          const x = sphereRadius * Math.cos(latRad) * Math.cos(lonRad)
          const y = sphereRadius * Math.sin(latRad)
          const z = sphereRadius * Math.cos(latRad) * Math.sin(lonRad)
          
          spherePoints.push({
            x, y, z,
            baseX: x, baseY: y, baseZ: z,
            size: Math.random() * 0.4 + 0.2,
            brightness: Math.random() * 0.3 + 0.5,
          })
        }
      }
      
      spherePointsRef.current = spherePoints

      // Create brain structure inside
      const brainPoints: BrainPoint[] = []
      const brainRadius = sphereRadius * 0.5
      
      // Brain hemispheres
      for (let i = 0; i < 120; i++) {
        const side = i < 60 ? -1 : 1
        const t = (i % 60) / 60
        
        // Brain shape curve
        const angle = t * Math.PI * 2
        const verticalPos = Math.sin(angle * 2) * 0.3
        
        const x = side * brainRadius * 0.4 * (0.8 + Math.sin(angle * 3) * 0.2)
        const y = brainRadius * (verticalPos + Math.cos(angle) * 0.5)
        const z = brainRadius * 0.5 * Math.sin(angle) * (0.9 + Math.cos(angle * 4) * 0.1)
        
        brainPoints.push({
          x, y, z,
          size: Math.random() * 0.5 + 0.3,
          pulseOffset: Math.random() * Math.PI * 2,
        })
      }
      
      // Brain folds/gyri
      for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * Math.PI * 2
        const layer = Math.floor(i / 20)
        const layerOffset = layer * 0.15
        
        const radiusMod = 0.3 + layerOffset + Math.sin(angle * 6) * 0.1
        const x = brainRadius * radiusMod * Math.cos(angle)
        const y = brainRadius * (Math.sin(angle * 2) * 0.4 + layerOffset * 0.5)
        const z = brainRadius * radiusMod * Math.sin(angle)
        
        brainPoints.push({
          x, y, z,
          size: Math.random() * 0.4 + 0.2,
          pulseOffset: Math.random() * Math.PI * 2,
        })
      }
      
      // Central brain stem
      for (let i = 0; i < 30; i++) {
        const t = i / 30
        const x = Math.sin(t * Math.PI * 4) * brainRadius * 0.1
        const y = -brainRadius * 0.3 - t * brainRadius * 0.4
        const z = Math.cos(t * Math.PI * 4) * brainRadius * 0.1
        
        brainPoints.push({
          x, y, z,
          size: Math.random() * 0.4 + 0.3,
          pulseOffset: Math.random() * Math.PI * 2,
        })
      }
      
      brainPointsRef.current = brainPoints

      // Background stars
      const stars: Star[] = []
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.3,
          opacity: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinklePhase: Math.random() * Math.PI * 2,
        })
      }
      starsRef.current = stars
    }

    initScene()
    const observer = new ResizeObserver(() => initScene())
    observer.observe(container)

    let time = 0

    const rotatePoint = (x: number, y: number, z: number, rotX: number, rotY: number) => {
      // Rotate around Y axis
      let newX = x * Math.cos(rotY) - z * Math.sin(rotY)
      let newZ = x * Math.sin(rotY) + z * Math.cos(rotY)
      
      // Rotate around X axis
      const newY = y * Math.cos(rotX) - newZ * Math.sin(rotX)
      newZ = y * Math.sin(rotX) + newZ * Math.cos(rotX)
      
      return { x: newX, y: newY, z: newZ }
    }

    const animate = () => {
      if (!ctx || !canvas) return
      time += 0.016

      const live = isLiveRef.current
      const rotSpeed = live ? 0.008 : 0.001
      
      rotationRef.current.y += rotSpeed
      rotationRef.current.x = Math.sin(time * 0.3) * 0.15

      // Deep navy background
      ctx.fillStyle = "#060a12"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      // Draw stars
      starsRef.current.forEach((star) => {
        const twinkle = Math.sin(time * star.twinkleSpeed * 60 + star.twinklePhase)
        const opacity = star.opacity * (0.5 + twinkle * 0.5) * (live ? 1 : 0.5)
        
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(150, 180, 220, ${opacity * 0.5})`
        ctx.fill()
      })

      const liveColor = { r: 34, g: 197, b: 94 }
      const deadColor = { r: 70, g: 70, b: 80 }
      const baseColor = live ? liveColor : deadColor

      // Collect all points with depth for sorting
      const allPoints: { x: number; y: number; z: number; size: number; brightness: number; isBrain: boolean; pulseOffset?: number }[] = []

      // Add sphere points
      spherePointsRef.current.forEach((p) => {
        const rotated = rotatePoint(p.baseX, p.baseY, p.baseZ, rotationRef.current.x, rotationRef.current.y)
        allPoints.push({
          x: rotated.x,
          y: rotated.y,
          z: rotated.z,
          size: p.size,
          brightness: p.brightness,
          isBrain: false,
        })
      })

      // Add brain points
      brainPointsRef.current.forEach((p) => {
        const rotated = rotatePoint(p.x, p.y, p.z, rotationRef.current.x, rotationRef.current.y)
        allPoints.push({
          x: rotated.x,
          y: rotated.y,
          z: rotated.z,
          size: p.size,
          brightness: 0.9,
          isBrain: true,
          pulseOffset: p.pulseOffset,
        })
      })

      // Sort by depth (back to front)
      allPoints.sort((a, b) => a.z - b.z)

      // Draw connections first (behind points)
      ctx.lineWidth = 0.5
      
      // Sphere connections
      const sphereScreenPoints = spherePointsRef.current.map((p) => {
        const rotated = rotatePoint(p.baseX, p.baseY, p.baseZ, rotationRef.current.x, rotationRef.current.y)
        const depth = (rotated.z + 300) / 600
        return { x: centerX + rotated.x, y: centerY + rotated.y, z: rotated.z, depth }
      })

      sphereScreenPoints.forEach((p1, i) => {
        sphereScreenPoints.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist < 60) {
            const avgDepth = (p1.depth + p2.depth) / 2
            const opacity = (1 - dist / 60) * 0.2 * avgDepth * (live ? 1 : 0.3)
            
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`
            ctx.stroke()
          }
        })
      })

      // Draw all points
      allPoints.forEach((p) => {
        const screenX = centerX + p.x
        const screenY = centerY + p.y
        const depth = (p.z + 300) / 600
        
        let finalOpacity = depth * (live ? 1 : 0.4)
        let glowMultiplier = live ? 1 : 0.3
        
        if (p.isBrain && p.pulseOffset !== undefined) {
          const pulse = Math.sin(time * 3 + p.pulseOffset) * 0.3 + 0.7
          finalOpacity *= pulse * (live ? 1.2 : 0.5)
          glowMultiplier *= pulse
        }

        const glowSize = p.size * (live ? 6 : 3) * glowMultiplier
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowSize)
        
        const b = p.brightness
        const color = p.isBrain && live 
          ? { r: 100, g: 255, b: 150 }
          : baseColor

        gradient.addColorStop(0, `rgba(${color.r + 100}, ${color.g + 50}, ${color.b + 50}, ${finalOpacity * 0.9})`)
        gradient.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, ${finalOpacity * 0.4})`)
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`)

        ctx.beginPath()
        ctx.arc(screenX, screenY, glowSize, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Bright core
        ctx.beginPath()
        ctx.arc(screenX, screenY, p.size * depth, 0, Math.PI * 2)
        if (p.isBrain && live) {
          ctx.fillStyle = `rgba(200, 255, 220, ${finalOpacity})`
        } else if (live) {
          ctx.fillStyle = `rgba(180, 255, 200, ${finalOpacity * 0.9})`
        } else {
          ctx.fillStyle = `rgba(130, 130, 140, ${finalOpacity * 0.7})`
        }
        ctx.fill()
      })

      // Outer glow ring
      const glowRadius = Math.min(canvas.width, canvas.height) * 0.25
      const ringGradient = ctx.createRadialGradient(centerX, centerY, glowRadius * 0.9, centerX, centerY, glowRadius * 1.4)
      ringGradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`)
      ringGradient.addColorStop(0.5, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${live ? 0.08 : 0.02})`)
      ringGradient.addColorStop(1, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0)`)
      
      ctx.beginPath()
      ctx.arc(centerX, centerY, glowRadius * 1.4, 0, Math.PI * 2)
      ctx.fillStyle = ringGradient
      ctx.fill()

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className || ""}`} style={{ zIndex: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
