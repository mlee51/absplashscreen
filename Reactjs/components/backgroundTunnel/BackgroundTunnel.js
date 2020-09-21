//import React, {Component, useState} from 'react';
import React, {Component} from 'react';
import styled from 'styled-components';

import * as THREE from '../../../node_modules/three/build/three.module.js';
import { FBXLoader } from '../../../node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { Reflector } from '../../../node_modules/three/examples/jsm/objects/Reflector.js';

// ##
//import Stats from '../../../node_modules/three/examples/jsm/libs/stats.module.js';
//import { GUI } from '../../../node_modules/three/examples/jsm/libs/dat.gui.module.js';
import { EffectComposer } from '../../../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../../../node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../../../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from '../../../node_modules/three/examples/jsm/shaders/FXAAShader.js';

class BackgroundTunnel extends Component {
    constructor() {
        super();
        //state = { width: 0, height: 0 };
        this.animate = this.animate.bind(this);
        this.onDocumentMouseMove = this.onDocumentMouseMove.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.reflectivefloor = this.reflectivefloor.bind(this);
        this.renderBloom = this.renderBloom.bind(this);
        this.darkenNonBloomed = this.darkenNonBloomed.bind(this);
        this.restoreMaterial = this.restoreMaterial.bind(this);
    }
  

    componentDidMount() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('touchmove', this.onDocumentMouseMove.bind(this), false);
        document.addEventListener('mousemove', this.onDocumentMouseMove.bind(this), false);
        document.addEventListener('wheel', this.onDocumentScroll.bind(this));
        
        // Just to make things easy
        // Including the verts and frags here
        const lightGlowVert=`
            varying vec2 vUv;
            void main(){
                vUv=uv;
                vec4 modelViewPosition=modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix*modelViewPosition;
            }`;

        const lightGlowFrag=`
            uniform sampler2D glowMask;
            uniform vec2 time;
            varying vec2 vUv;
            void main(){
                vec2 _vUv = vUv;
                _vUv.y = (floor(vUv.y*10.))*0.1;
                vec3 maskCd=texture2D(glowMask, vUv).rgb;
                vec4 titleLightCd=vec4((1.-vUv.y)*vUv.y, .05*vUv.y, 0.03, 0.4+ fract((vUv.y*(mod(time.x,100.0))*100.1)*100.)); // Antibody Club Glow Color
                vec4 sideLightsCd=vec4(0, 0.59, 0.531,  vUv.y); // Side Lights Glow Color
                //sideLightsCd=vec4(0, 0.59, 0.531,  fract(((1.-vUv.x)*vUv.x+time.x*0.01)*30.)); // Side Lights Fract Horizontal Push
                
                maskCd.r *= mix(titleLightCd.r+0.5, maskCd.r*maskCd.r*(sin( time.x*.2)+3.),(1.-vUv.y)*vUv.y);//sin( time.x*.2+.77)*.3+.2); // I dunno, make the title pulse a little
                //maskCd.r /= mix(0.,maskCd.r*maskCd.r*maskCd.r,0.7);
                maskCd.gb *=2.127;
                
                maskCd.g *= 0.4;
                maskCd.b *= 0.4;
                //maskCd.r *= 0.5;
                
                sideLightsCd = sideLightsCd * ( sin( time.x* -0.133 )*.1+.9 ); // Light Color
                maskCd.b*= step( 0.0, sin(time.x*.2+cos(time.x + .57 + sin(time.x*.7+1.15) ))*.6+.4 + sin(time.x*.1+1.9)*.1 ); // Light flicker for fun
                
                vec4 Cd=vec4( 0.0 );
                Cd+= titleLightCd * maskCd.r ; // Antibody Club Lighting
                Cd+= sideLightsCd * maskCd.g ; // Left Door Light
                Cd+= sideLightsCd * maskCd.b ; // Right Door Light

                gl_FragColor=Cd;
            }`;

        const vertBloomCompPass=`
            varying vec2 vUv;

            void main() {

                vUv = uv;

                gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

            }`;

        const fragBloomCompPass=`
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;

            varying vec2 vUv;

            void main() {

                gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );

            }`;


    
        this.mobile = false;

        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            this.mobile = true;
        }
        this.WIDTH = this.mount.clientWidth;
        this.HEIGHT = this.mount.clientHeight;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.pixelRatio = window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.WIDTH, this.HEIGHT);
        //this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.ENTIRE_SCENE = 0;
        this.BLOOM_SCENE = 1;
        this.bloomLayer = new THREE.Layers();
        this.bloomLayer.set(this.BLOOM_SCENE);
        this.materials = {};
        this.darkMaterial = new THREE.MeshBasicMaterial({ color: "black" });
        this.mount.appendChild(this.renderer.domElement);


        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(this.mobile ? 60 : 50, this.WIDTH / this.HEIGHT, 1, 1000);
        this.mouse = new THREE.Vector2();
        this.eulermouse = new THREE.Euler(0, 0, 0, 'XYZ');
        this.qmouse = new THREE.Quaternion();

        this.introComposer = null;
        var introBloomPass = null;
        this.startTime = null;
        this.msRunner = new THREE.Vector2(0, 0);



        this.camera.position.set(10, 10, 5);


        const emissivePath = require("../../assets/models/textures/emissiveMap_1k.jpg");
        var uniforms = {
            time: { value: this.msRunner }, // Just to get time into the shader
            glowMask: { type: 't', value: new THREE.TextureLoader().load(emissivePath) }
        };
        let glowMat = new THREE.ShaderMaterial({
            uniforms: uniforms,
            
            vertexShader: lightGlowVert,
            fragmentShader: lightGlowFrag,
            
            blending: THREE.NormalBlending,
            transparent: true,
            //depthTest:false,
        });


        const fbxPath = require("../../assets/models/fbx/MicroSite_v04_noTunnelFloor.fbx");
        const loader = new FBXLoader(); 
        const thisRef=this; // For reference in events
        loader.load(fbxPath, function (object) {
            object.scale.set(0.01, 0.01, 0.01);
            //var ac = new THREE.Mesh(object,material);
            object.traverse(function (curObj) { // ## The variable was overwriting the "object" above
                if (curObj.isMesh) {
                    //const oldMat = curObj.material;
                    if (curObj.name === "antibody_club") {
                        curObj.material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeb4034, emissiveIntensity: 0.0 });
                        //curObj.layers.enable( thisRef.BLOOM_SCENE );
                    } else if (curObj.name === "floor") {
                        curObj.material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: thisRef.mobile ? 1.0 : 0.85 /*emissive:  0xffffff,  emissiveIntensity : 100*/ });
                    } else if (curObj.name === "lightGlow") {
                        curObj.material = glowMat;
                        curObj.layers.enable(thisRef.BLOOM_SCENE);
                    } else {
                        curObj.material = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, shininess: thisRef.mobile ? 10.0 : 30.0 });
                    }
                }
            });

            thisRef.scene.add(object);

        });


        this.tunnelCyanLight = new THREE.PointLight(0x009686, 1.5, 40, 14);
        this.tunnelCyanLight.position.set(-1, 2.5, -1.5);
        this.scene.add(this.tunnelCyanLight);
        this.tl = [];
        this.amt = this.mobile ? 8 : 20;
        this.lightdelta = this.mobile ? 26.25 : 10.5;
        this.lightdist = this.mobile ? 222 : 111;
        this.lightdecay = this.mobile ? 16 : 18;
        this.tcolor = new THREE.Color(0xff5040);
        this.ncolor = new THREE.Color(0xfc5603);


        for (let i = 0; i < this.amt; i++) {
            this.tl[i] = new THREE.PointLight(this.tcolor, 2, this.lightdist, this.lightdecay);
            this.tl[i].position.set(0, 1, -6 - (this.lightdelta * i));
            this.tl[i].zval = this.tl[i].position.z;
            this.tl[i].ival = Math.random() * (1.5 - 0.8) + 0.8;
            this.scene.add(this.tl[i]);
        }

        if (this.mobile === false) { this.reflectivefloor(); }


        this.trackCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(4.26, 1.17, 12.29),
            new THREE.Vector3(0.5, 1.05, 7.94),
            new THREE.Vector3(0, 1, 2.27),
            new THREE.Vector3(0, 1, -10),
            new THREE.Vector3(0, 1, -20),
            new THREE.Vector3(0, 1, -30),
            new THREE.Vector3(0, 1, -50),
            new THREE.Vector3(0, 1, -70)
        ], false, "centripetal");


        this.camPosIndex = 0;
        this.x = this.mobile? 14:1;
        this.e = 0;


        // ## Dat Gui to help with setting settings-
        /*
        var datGui = new GUI();
        datGui.closed = false;
        */
        var params = {
            //exposure: 1,
            bloomStrength: 1.2,
            bloomThreshold: .051,
            bloomRadius: 0.92
        };
        /*datGui.add( params, 'exposure', 0.1, 2 ).onChange( function ( value ) {
            this.renderer.toneMappingExposure = Math.pow( value, 4.0 );
        } );*/



        var renderPass = new RenderPass(this.scene, this.camera);
        // THREE.UnrealBloomPass ( resolution, strength, radius, threshold )
        introBloomPass = new UnrealBloomPass(new THREE.Vector2(this.WIDTH * .5, this.HEIGHT * .5), 1.5, 0.8, 0.85);
        introBloomPass.threshold = params.bloomThreshold;
        introBloomPass.strength = params.bloomStrength;
        introBloomPass.radius = params.bloomRadius;


        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (this.WIDTH * this.pixelRatio);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (this.HEIGHT * this.pixelRatio);

        this.bloomComposer = new EffectComposer(this.renderer);
        this.bloomComposer.renderToScreen = false;
        this.bloomComposer.addPass(renderPass);
        this.bloomComposer.addPass(introBloomPass);
        this.bloomComposer.addPass(this.fxaaPass);
        //console.log(bloomComposer);

        var finalPass = new ShaderPass(
            new THREE.ShaderMaterial({
                uniforms: {
                    baseTexture: { value: null },
                    bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
                },
                
                vertexShader: vertBloomCompPass,
                fragmentShader: fragBloomCompPass,
                
                defines: {}
            }), "baseTexture"
        );
        finalPass.needsSwap = true;

        this.introComposer = new EffectComposer(this.renderer);
        this.introComposer.addPass(renderPass);

        this.introComposer.addPass(finalPass);
        this.introComposer.addPass(this.fxaaPass);

 
        //this.introComposer.addPass(introBloomPass);
        //this.introBloomPass.renderToScreen = true;


        this.lightspeed = this.mobile ? 0.15 : 0.05;

        this.animate();
    }
      


// -- -- -- -- -- -- -- -- -- //
// -- Animate Function  -- -- //
// -- -- -- -- -- -- -- -- -- //
      
    animate() {
        // Used om component clean up
        this.frameRequest = window.requestAnimationFrame(this.animate);

        // -- -- -- -- -- -- //

        var timer = Date.now() * 0.005;

        if (!this.startTime){
            this.startTime = timer;
        }
        this.msRunner.x = (timer - this.startTime); // Date.now() is a HUGE number, so OpenGL doesn't like it

        for (let i = 0; i < this.amt; i++) {
            if (this.mobile) {
                this.tl[i].position.y = 1 + (Math.sin((timer + (4 * i)) * 0.25) * 0.2);
                this.tl[i].position.x = (Math.cos((timer + (4 * i)) * 0.25) * 0.2);
            }
            if (this.tl[i].position.z > 0) {
                this.tl[i].position.z = -205.5;
                this.tl[i].distance = this.lightdist;

            }
            else if (this.tl[i].position.z < -205.5) {
                this.tl[i].position.z = -6;
            }
            else {
                this.tl[i].position.z += this.lightspeed + this.e * (((this.camPosIndex < 100 ? 1 : this.camPosIndex - 100) / 1000));
            }

            var abslfo = Math.abs(Math.cos(0.1 * timer + i)); 
            var vcolor = new THREE.Color(THREE.Math.lerp(this.tcolor.r, this.ncolor.r, abslfo), THREE.Math.lerp(this.tcolor.g, this.ncolor.g, abslfo), THREE.Math.lerp(this.tcolor.b, this.ncolor.b, abslfo));
            this.tl[i].color.set(vcolor);
            if (this.tl[i].position.z > -4) {
                this.tl[i].distance += 10.0;
                this.tl[i].intensity -= this.tl[i].intensity * 0.05;
            }
            else {
                this.tl[i].intensity = this.tl[i].ival + (Math.cos(timer * 0.1 + i) * this.tl[i].ival * 0.85);
            }
        }
        this.tunnelCyanLight.intensity = 1.7 + (Math.sin(timer * 0.133) * 0.5);

        this.camPosIndex = THREE.MathUtils.lerp(this.camPosIndex, this.x * 30, 0.05);
        if (this.camPosIndex > 1000) {
            this.camPosIndex = 1000;
        }

        this.camPos = this.trackCurve.getPoint(this.camPosIndex / 1000);
        this.camRot = this.trackCurve.getTangent(this.camPosIndex / 1000);
        this.camera.position.x = this.camPos.x;
        this.camera.position.y = this.camPos.y;
        this.camera.position.z = this.camPos.z * (1 - ((this.camPosIndex < 800 ? 0 : this.camPosIndex - 800) / 1000));


        if (this.camPosIndex < 205) {
            this.camera.lookAt(0, 1.0, 0);
            if (this.mobile === false) {
                this.camera.applyQuaternion(this.camera.quaternion.clone().multiply(this.qmouse)); 
            } 
        }
        else if (this.mobile === false) {
            this.camera.quaternion.setFromEuler(this.eulermouse);
        }
        this.renderBloom(false);
        this.introComposer.render();
        //this.renderer.render(scene, camera);

        //this.mobile ? this.renderer.render(scene, camera) : this.introComposer.render(); // ## Render Composer
    }
  




// -- -- -- -- -- -- -- -- -- //
// -- Render Functions  -- -- //
// -- -- -- -- -- -- -- -- -- //

    reflectivefloor() {
        var pb = new THREE.PlaneBufferGeometry(300, 300);
        var groundMirror = new Reflector(pb, {
            clipBias: 0.003,
            textureWidth: this.WIDTH * window.devicePixelRatio,
            textureHeight: this.HEIGHT * window.devicePixelRatio,
            color: 0x808080
        });
        groundMirror.position.y = -0.7;
        groundMirror.rotateX(- Math.PI / 2);
        this.scene.add(groundMirror);
    }

    renderBloom(mask) {
        if (mask === true) {

            this.scene.traverse(this.darkenNonBloomed);
            this.bloomComposer.render();
            this.scene.traverse(this.restoreMaterial);

        } else {

            this.camera.layers.set(this.BLOOM_SCENE);
            this.bloomComposer.render();
            this.camera.layers.set(this.ENTIRE_SCENE);

        }
    }

    darkenNonBloomed(obj) {
        if (obj.isMesh && this.bloomLayer.test(obj.layers) === false) {

            this.materials[obj.uuid] = obj.material;
            obj.material = this.darkMaterial;

        }
    }

    restoreMaterial(obj) {
        if (this.materials[obj.uuid]) {

            obj.material = this.materials[obj.uuid];
            delete this.materials[obj.uuid];

        }
    }



// -- -- -- -- -- -- -- -- -- //
// --  Event Listeners  -- -- //
// -- -- -- -- -- -- -- -- -- //

    onDocumentScroll(event) {
        // ## Just a warning, some browsers are 120, and some are - not + on scroll
        this.e = event.deltaY / 400;
        
        if (this.e < 0) {
            this.e *= 3;
        }
        
        this.x += this.e;
        this.x = THREE.MathUtils.clamp(this.x, 0, 100); // Tunnel travel limit
        
    }


    onDocumentMouseMove(event) {
        //this.setState({ width: window.innerWidth, height: window.innerHeight });
        // Test if needed, mobile might error on preventedDefault
        // event.preventDefault();
        if(event.touches){ // Mobile / Touch Screen
            var touch = event.touches[0];
            if(typeof(event.touches[1]) !== 'undefined'){ // ## Not really needed, zoom/pinch might be useful
                var touchTwo = event.touches[1];
                touch.pageX = (touch.pageX + touchTwo.pageX) * .5;
                touch.pageY = (touch.pageY + touchTwo.pageY) * .5;
            }
            this.mouse.x=touch.pageX;
            this.mouse.y=touch.pageY;
        }else{ // PC / Mouse
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        }
        
        this.mouse.x = (this.mouse.x / this.WIDTH) - .5;
        this.mouse.y = (this.mouse.y / this.HEIGHT) - .5;
        
        this.eulermouse.x = -this.mouse.y * 0.6;
        this.eulermouse.y = -this.mouse.x * 0.6;
        this.qmouse.setFromEuler(this.eulermouse);
        // console.log(mouse);
    }

    onWindowResize() {
        //this.setState({ width: window.innerWidth, height: window.innerHeight });
        this.WIDTH = window.innerWidth;
        this.HEIGHT = window.innerHeight;

        this.camera.aspect = this.WIDTH / this.HEIGHT;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.WIDTH, this.HEIGHT);
        //controls.handleResize();

        this.pixelRatio = this.renderer.getPixelRatio();
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (this.WIDTH * this.pixelRatio);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (this.HEIGHT * this.pixelRatio);
        this.introComposer.setSize(this.WIDTH, this.HEIGHT);
    }


// -- -- -- -- -- -- -- -- -- //
// -- Component Cleanup -- -- //
// -- -- -- -- -- -- -- -- -- //

    componentWillUnmount() {
        window.removeEventListener('resize', this.onWindowResize);
        document.removeEventListener('touchmove', this.onDocumentMouseMove);
        document.removeEventListener('mousemove', this.onDocumentMouseMove);
        document.removeEventListener('wheel', this.onDocumentScroll);
        
        cancelAnimationFrame(this.frameRequest);
        this.mount.removeChild(this.renderer.domElement);
    }

// -- -- -- -- -- -- -- -- -- //
    render(){
      return (
        <BackgroundParent
            id="backgroundTunnel"
            ref={mount => {
                this.mount = mount;
            }}
        />
      );
    }
};

export default BackgroundTunnel;

const BackgroundParent = styled.div`
  position: fixed;
  top:0px;
  left:0px;
  height:100%;
  width:100%;
  overflow:none;
  user-select:one;
  z-index: -1;
`;