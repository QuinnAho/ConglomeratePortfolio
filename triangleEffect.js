// triangleEffect.js
export default class TriangleEffect {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!this.gl) {
        console.error("WebGL not supported in this browser");
        return;
      }
      
      // Options with defaults
      this.meshRows = options.meshRows || 40;
      this.meshCols = options.meshCols || 40;
      this.effectRadius = options.effectRadius || 0.2; // normalized distance (0 to 1)
      this.maxLift = options.maxLift || 0.1; // maximum displacement (in clip space)
      this.baseColor = options.baseColor || [0.1, 0.1, 0.1, 1.0]; // dark (mechanical look)
      this.lightColor = options.lightColor || [1.0, 1.0, 1.0, 1.0]; // white light
  
      // Track mouse in normalized [0,1] coordinates
      this.mouse = [0.5, 0.5];
      
      this.createShaders();
      this.createMesh();
      this.setupGL();
      this.setupEvents();
  
      this.lastTime = 0;
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }
    
    createShaders() {
      const vsSource = `
        attribute vec2 aPosition;
        varying vec2 vUv;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uEffectRadius;
        uniform float uMaxLift;
        
        void main() {
          // aPosition is in [0,1] space; convert to clip space (-1 to 1)
          vec2 pos = aPosition * 2.0 - 1.0;
          vUv = aPosition;
          
          // Compute distance from this vertex to the mouse position.
          float dist = distance(aPosition, uMouse);
          float lift = 0.0;
          if (dist < uEffectRadius) {
            // The closer the vertex is, the larger the lift.
            lift = (1.0 - smoothstep(0.0, uEffectRadius, dist)) * uMaxLift;
          }
          
          // Add lift to the Y coordinate (could be extended to tilt, if desired)
          pos.y += lift;
          gl_Position = vec4(pos, 0.0, 1.0);
        }
      `;
      
      const fsSource = `
        precision mediump float;
        varying vec2 vUv;
        uniform vec4 uBaseColor;
        uniform vec4 uLightColor;
        uniform vec2 uMouse;
        uniform float uEffectRadius;
        
        void main() {
          // Calculate a brightness factor based on the distance from the mouse.
          float dist = distance(vUv, uMouse);
          float factor = 1.0 - smoothstep(0.0, uEffectRadius, dist);
          // Blend between the base and light color.
          vec4 color = mix(uBaseColor, uLightColor, factor);
          gl_FragColor = color;
        }
      `;
      
      this.program = this.initShaderProgram(vsSource, fsSource);
      this.attribLocations = {
        aPosition: this.gl.getAttribLocation(this.program, 'aPosition')
      };
      this.uniformLocations = {
        uResolution: this.gl.getUniformLocation(this.program, 'uResolution'),
        uMouse: this.gl.getUniformLocation(this.program, 'uMouse'),
        uEffectRadius: this.gl.getUniformLocation(this.program, 'uEffectRadius'),
        uMaxLift: this.gl.getUniformLocation(this.program, 'uMaxLift'),
        uBaseColor: this.gl.getUniformLocation(this.program, 'uBaseColor'),
        uLightColor: this.gl.getUniformLocation(this.program, 'uLightColor')
      };
    }
    
    initShaderProgram(vsSource, fsSource) {
      const gl = this.gl;
      const vertexShader = this.loadShader(gl.VERTEX_SHADER, vsSource);
      const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fsSource);
      
      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      
      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Shader program failed to initialize: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
      }
      return shaderProgram;
    }
    
    loadShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      
      if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    
    createMesh() {
      // Create a regular grid covering [0,1] in both x and y
      const rows = this.meshRows;
      const cols = this.meshCols;
      const vertices = [];
      const indices = [];
      
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
          let u = j / cols;
          let v = i / rows;
          vertices.push(u, v);
        }
      }
      
      // Create indices for two triangles per grid cell
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          let index = i * (cols + 1) + j;
          indices.push(index, index + 1, index + cols + 1);
          indices.push(index + 1, index + cols + 2, index + cols + 1);
        }
      }
      
      this.vertexData = new Float32Array(vertices);
      this.indexData = new Uint16Array(indices);
    }
    
    setupGL() {
      const gl = this.gl;
      // Create vertex buffer
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.STATIC_DRAW);
      
      // Create index buffer
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData, gl.STATIC_DRAW);
      
      gl.useProgram(this.program);
      
      // Setup vertex attribute
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.attribLocations.aPosition);
      gl.vertexAttribPointer(this.attribLocations.aPosition, 2, gl.FLOAT, false, 0, 0);
      
      // Set uniform values that do not change per frame
      gl.uniform1f(this.uniformLocations.uEffectRadius, this.effectRadius);
      gl.uniform1f(this.uniformLocations.uMaxLift, this.maxLift);
      gl.uniform4fv(this.uniformLocations.uBaseColor, new Float32Array(this.baseColor));
      gl.uniform4fv(this.uniformLocations.uLightColor, new Float32Array(this.lightColor));
      
      this.resize();
    }
    
    setupEvents() {
      // Handle mouse movement
      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse[0] = (e.clientX - rect.left) / rect.width;
        this.mouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
      });
      // Handle touch movement
      this.canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.mouse[0] = (touch.clientX - rect.left) / rect.width;
        this.mouse[1] = 1.0 - (touch.clientY - rect.top) / rect.height;
      }, { passive: false });
    }
    
    animate(time) {
      const gl = this.gl;
      // Update time in seconds (if needed for smoothing)
      time *= 0.001;
      this.lastTime = this.lastTime || time;
      const deltaTime = time - this.lastTime;
      this.lastTime = time;
      
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(this.program);
      
      // Update dynamic uniforms
      gl.uniform2f(this.uniformLocations.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform2fv(this.uniformLocations.uMouse, this.mouse);
      
      // Draw the mesh
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.indexData.length, gl.UNSIGNED_SHORT, 0);
      
      requestAnimationFrame(this.animate);
    }
    
    resize() {
      // Adjust canvas size (if you want to support responsive resizing)
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  