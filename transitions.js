class PageTransitionManager {
    constructor(options = {}) {
        this.duration = options.duration || 800;
        this.timing = options.timing || 'ease';
        this.containerSelector = options.containerSelector || '#page-container';
        this._isFlipping = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.href.startsWith(window.location.origin)) {
                e.preventDefault();
                this.navigateTo(link.href);
            }
        });

        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.url) {
                this.navigateTo(e.state.url, true);
            }
        });
    }

    async _crumpleOut(container) {
        // Capture screenshot of current page
        const canvas = await html2canvas(container, {backgroundColor: null});
        const dataUrl = canvas.toDataURL();

        // Set up Three.js scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 700;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);

        const wrapper = document.getElementById('crumple-canvas-wrapper');
        wrapper.appendChild(renderer.domElement);

        // Create textured plane
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(dataUrl);

        const geometryWidth = container.offsetWidth;
        const geometryHeight = container.offsetHeight;
        const segmentsX = 20;
        const segmentsY = 20;
        const planeGeometry = new THREE.PlaneGeometry(geometryWidth, geometryHeight, segmentsX, segmentsY);
        const planeMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);

        // Center the plane
        plane.position.x = 0;
        plane.position.y = 0;

        scene.add(plane);

        // Animation loop
        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        // Crumple animation
        const positionAttribute = planeGeometry.attributes.position;
        const vertexCount = positionAttribute.count;
        const randomTargetPositions = [];

        for (let i = 0; i < vertexCount; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);
            const z = positionAttribute.getZ(i);

            const randomX = x * (0.5 + Math.random() * 0.5);
            const randomY = y * (0.5 + Math.random() * 0.5);
            const randomZ = (Math.random() - 0.5) * 200;

            randomTargetPositions.push({ x: randomX, y: randomY, z: randomZ });
        }

        // Animate vertices
        await new Promise((resolve) => {
            gsap.to({}, {
                duration: 1.5,
                onUpdate: function() {
                    for (let i = 0; i < vertexCount; i++) {
                        const rx = randomTargetPositions[i].x;
                        const ry = randomTargetPositions[i].y;
                        const rz = randomTargetPositions[i].z;

                        const origX = positionAttribute.getX(i);
                        const origY = positionAttribute.getY(i);
                        const origZ = positionAttribute.getZ(i);

                        const progress = this.ratio;

                        const newX = origX + (rx - origX) * progress;
                        const newY = origY + (ry - origY) * progress;
                        const newZ = origZ + (rz - origZ) * progress;

                        positionAttribute.setXYZ(i, newX, newY, newZ);
                    }
                    positionAttribute.needsUpdate = true;
                },
                onComplete: resolve,
                ease: "power2.inOut"
            });
        });

        // Scale out animation
        await new Promise((resolve) => {
            gsap.to(plane.scale, {
                duration: 0.6,
                x: 0,
                y: 0,
                z: 0,
                onComplete: resolve,
                ease: "power2.in"
            });
        });

        // Cleanup
        wrapper.removeChild(renderer.domElement);
        planeGeometry.dispose();
        planeMaterial.dispose();
        texture.dispose();
        renderer.dispose();
    }

    async navigateTo(url, isPopState = false) {
        if (this._isFlipping) return;
        this._isFlipping = true;

        const container = document.querySelector(this.containerSelector);
        if (!container) {
            window.location.href = url;
            return;
        }

        // Crumple out animation
        await this._crumpleOut(container);

        // Fetch new content
        let newContent;
        try {
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');
            newContent = newDoc.querySelector(this.containerSelector).innerHTML;
            document.title = newDoc.title;
        } catch (error) {
            console.error('Navigation failed:', error);
            window.location.href = url;
            return;
        }

        // Update content
        container.innerHTML = newContent;
        container.style.opacity = 1;

        // Update URL if not a popstate event
        if (!isPopState) {
            window.history.pushState({ url }, '', url);
        }

        this._isFlipping = false;
    }
}

// Initialize the transition manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pageTransition = new PageTransitionManager({
        duration: 800,
        containerSelector: '#page-container'
    });
});
