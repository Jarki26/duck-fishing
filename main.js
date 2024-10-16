import * as THREE from "three"

import Stats from "three/addons/libs/stats.module.js"

import { GUI } from "three/addons/libs/lil-gui.module.min.js"
// import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { DragControls } from "three/addons/controls/DragControls.js"
import { Water } from "three/addons/objects/Water.js"
import { Sky } from "three/addons/objects/Sky.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

let container, stats
let camera, raycaster, pointer, scene, renderer, sound
let controls, water, sun, mesh, duck
let objects = []
let loader
const parameters = {
  hasStick: false,
  elevation: 2,
  azimuth: 180,
}

const SCALE = 100
const RATIO = SCALE / 100
const LANG = "en-US"
const recognition_list = [
  "quack",
  "duck",
  "work",
  "black",
  "crack",
  "walk",
  "what",
]

let sp
let lastSpeech = ""

try {
  ini_speech()
} catch (error) {
  console.error("Speech recognition not supported", error)
}

init()

function ini_speech() {
  let Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  sp = new Recognition()
  sp.continuous = true
  sp.lang = LANG
  sp.onresult = (e) => {
    const length = e?.results?.length - 1
    const transcript = e?.results?.item(length)?.item(0)?.transcript
    // console.log("debug", e?.results?.item(length))
    console.log("transcript:", transcript)
    lastSpeech = transcript
  }
  sp.onerror = console.error
}

export function speechStart() {
  sp.start()
  console.log("Speech started")
}

export function speechStop() {
  sp.stop()
  console.log("Speech stopped")
}

function speechClear() {
  lastSpeech = ""
}

function init() {
  container = document.getElementById("container")

  //

  renderer = new THREE.WebGLRenderer()
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setAnimationLoop(animate)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.5
  container.appendChild(renderer.domElement)

  //

  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    1,
    20000
  )
  camera.position.set(30 * RATIO, 30 * RATIO, 100 * RATIO)
  camera.lookAt(
    new THREE.Vector3(0, 0, 0).addVectors(
      scene.position,
      new THREE.Vector3(0, 20 * RATIO, 0)
    )
  )

  sound = ini_sound()

  //

  load_duck()

  //

  sun = new THREE.Vector3()

  // Water

  water = ini_water()

  // Skybox

  var { sky, renderTarget, sceneEnv, pmremGenerator } = ini_skybox()

  function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation)
    const theta = THREE.MathUtils.degToRad(parameters.azimuth)

    sun.setFromSphericalCoords(1, phi, theta)

    sky.material.uniforms["sunPosition"].value.copy(sun)
    water.material.uniforms["sunDirection"].value.copy(sun).normalize()

    if (renderTarget !== undefined) renderTarget.dispose()

    sceneEnv.add(sky)
    renderTarget = pmremGenerator.fromScene(sceneEnv)
    scene.add(sky)

    scene.environment = renderTarget.texture
  }

  updateSun()

  //

  mesh = ini_mesh()

  controls = ini_controls()
  //

  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("click", onClick)

  // GUI

  ini_gui(updateSun)

  //

  window.addEventListener("resize", onWindowResize)
}

function onPointerMove(event) {
  // calculate pointer position in normalized device coordinates
  // (-1 to +1) for both components
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
}

function ini_sound() {
  const listener = new THREE.AudioListener()
  camera.add(listener)
  sound = new THREE.Audio(listener)
  const audioLoader = new THREE.AudioLoader()
  audioLoader.load("./sounds/quack.mp3", function (buffer) {
    sound.setBuffer(buffer)
    // sound.setLoop(true)
    sound.setVolume(0.5)
    // sound.play()
  })
  return sound
}

function load_duck() {
  //TODO: Load duck model with promise
  loader = new GLTFLoader()
  loader.load(
    "./models/Rubber_Duck.glb",
    function (gltf) {
      gltf.scene.scale.set(SCALE, SCALE, SCALE)
      duck = gltf.scene
      //   duck.position.x = 29 * RATIO
      duck.rotation.y = Math.PI / 3
      scene.add(duck)
      console.log("Duck loaded", duck)
    },
    undefined,
    function (error) {
      console.error(error)
    }
  )
}

function ini_skybox() {
  const sky = new Sky()
  sky.scale.setScalar(10000)
  scene.add(sky)

  const skyUniforms = sky.material.uniforms

  skyUniforms["turbidity"].value = 10
  skyUniforms["rayleigh"].value = 2
  skyUniforms["mieCoefficient"].value = 0.005
  skyUniforms["mieDirectionalG"].value = 0.8

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const sceneEnv = new THREE.Scene()

  let renderTarget
  return { sky, renderTarget, sceneEnv, pmremGenerator }
}

function ini_gui(updateSun) {
  const gui = new GUI()

  gui.add(parameters, "hasStick").onChange(toggleRod)

  const folderSky = gui.addFolder("Sky")
  folderSky.add(parameters, "elevation", 0, 90, 0.1).onChange(updateSun)
  folderSky.add(parameters, "azimuth", -180, 180, 0.1).onChange(updateSun)
  folderSky.close()

  const waterUniforms = water.material.uniforms

  const folderWater = gui.addFolder("Water")
  folderWater
    .add(waterUniforms.distortionScale, "value", 0, 8, 0.1)
    .name("distortionScale")
  folderWater.add(waterUniforms.size, "value", 0.1, 10, 0.1).name("size")
  folderWater.close()

  gui.close()

  // Stats
  // stats = new Stats()
  // container.appendChild(stats.dom)
}

function ini_controls() {
  //   controls = new OrbitControls(camera, renderer.domElement)
  //   controls.maxPolarAngle = Math.PI * 0.495
  //   controls.target.set(0, 10, 0)
  //   controls.minDistance = 40.0
  //   controls.maxDistance = 200.0
  //   controls.update()

  controls = new DragControls(objects, camera, renderer.domElement)
  controls.addEventListener("dragstart", function (event) {
    event.object.material.emissive.set(0xaaaaaa)
    // custom_sound_play()
  })
  controls.addEventListener("dragend", function (event) {
    event.object.material.emissive.set(0x000000)
    sound.stop()
  })

  return controls
}

function ini_mesh() {
  const geometry = new THREE.BoxGeometry(1, 1, 30)
  const material = new THREE.MeshStandardMaterial({ roughness: 0 })
  mesh = new THREE.Mesh(geometry, material)
  mesh.position.x = 30
  mesh.position.y = 15
  mesh.position.z = 60
  objects.push(mesh)

  return mesh
}

function ini_water() {
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000)

  water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      "./textures/waternormals.jpg",
      function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      }
    ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined,
  })

  water.rotation.x = -Math.PI / 2

  scene.add(water)

  return water
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
}

function onClick() {
  renderRay()
}

function renderRay() {
  // update the picking ray with the camera and pointer position
  raycaster.setFromCamera(pointer, camera)
  // calculate objects intersecting the picking ray
  const intersects = raycaster.intersectObjects(duck ? [duck] : [])
  if ((intersects?.length ?? 0) > 0) {
    custom_sound_play()
  }
  renderer.render(scene, camera)
}

function custom_sound_play() {
  const volumeRnd = Math.floor(Math.random() * 5) / 10
  console.log("volumeRnd", volumeRnd)
  // sound.detune = volumeRnd
  sound.setVolume(0.5 + volumeRnd)
  sound.play()
}

function check_speech_quack() {
  if (lastSpeech === "") return
  if (
    recognition_list.some((word) => lastSpeech.toLowerCase().includes(word))
  ) {
    custom_sound_play()
  }
  speechClear()
}

function animate() {
  render()
  stats?.update()
}

function render() {
  const time = performance.now() * 0.001
  duck_animation(time)
  mesh_animation(time)
  //   renderRay()

  water.material.uniforms["time"].value += 1.0 / 60.0
  check_speech_quack()

  renderer.render(scene, camera)
}

function mesh_animation(time) {
  if (mesh && duck) {
    const newLocal = new THREE.Vector3().clone(duck.position)
    newLocal.y = 20 * RATIO
    mesh.lookAt(newLocal)
    //   mesh.position.y = Math.cos(time) * 5 + 14 * RATIO
  }
}

function toggleRod() {
  if (parameters?.hasStick) {
    scene.add(mesh)
  } else {
    removeObjectFromScene(mesh)
  }
}

// Función para eliminar un objeto de la escena
function removeObjectFromScene(object) {
  if (scene && object) {
    scene.remove(object)
    object.geometry.dispose()
    object.material.dispose()
  }
}

function duck_animation(time) {
  if (duck) {
    duck.position.y = Math.sin(time) * 4 + 15 * RATIO
    duck.rotation.x = (Math.cos(time * 0.5) / 5) * RATIO
    duck.rotation.z = (Math.sin(time * 0.4) / 5) * RATIO
  }
}
