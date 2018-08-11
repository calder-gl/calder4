import {
    Armature,
    CostFunction,
    GeneratorInstance,
    Light,
    Material,
    Node,
    Point,
    Renderer,
    RGBColor,
    Shape
} from '../calder';

// tslint:disable-next-line:import-name
import Bezier = require('bezier-js');

// Create the renderer
const renderer: Renderer = new Renderer({
    width: 800,
    height: 600,
    maxLights: 2,
    ambientLightColor: RGBColor.fromRGB(90, 90, 90),
    backgroundColor: RGBColor.fromHex('#FFDDFF')
});

// Create light sources for the renderer
const light1: Light = Light.create({
    position: { x: 10, y: 10, z: 10 },
    color: RGBColor.fromHex('#FFFFFF'),
    strength: 200
});

// Add lights to the renderer
renderer.addLight(light1);

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 1: create geometry
///////////////////////////////////////////////////////////////////////////////////////////////////

// Setup leaf
const leafColor = RGBColor.fromRGB(204, 255, 204);
const leafSphere = Shape.sphere(Material.create({ color: leafColor, shininess: 100 }));

// Setup branch
const branchColor = RGBColor.fromRGB(102, 76.5, 76.5);
const branchShape = Shape.cylinder(Material.create({ color: branchColor, shininess: 1 }));

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 2: create armature
///////////////////////////////////////////////////////////////////////////////////////////////////

const bone = Armature.define((root: Node) => {
    root.createPoint('base', { x: 0, y: 0, z: 0 });
    root.createPoint('mid', { x: 0, y: 0.5, z: 0 });
    root.createPoint('tip', { x: 0, y: 1, z: 0 });
    root.createPoint('handle', { x: 1, y: 0, z: 0 });
});

const treeGen = Armature.generator();
treeGen
    .define('branch', (root: Point, instance: GeneratorInstance) => {
        const node = instance.add(bone());
        node.point('base').stickTo(root);
        node.scale(Math.random() * 0.4 + 0.9);
        node.hold(node.point('tip'))
            .rotate(Math.random() * 360)
            .release();
        node.hold(node.point('handle'))
            .rotate(Math.random() * 70)
            .release();
        node.scale(0.8); // Shrink a bit

        const trunk = instance.add(node.point('mid').attach(branchShape));
        trunk.scale({ x: 0.2, y: 1, z: 0.2 });

        instance.addDetail({ component: 'branchOrLeaf', at: node.point('tip') });
    })
    .defineWeighted('branchOrLeaf', 1, (root: Point, instance: GeneratorInstance) => {
        instance.addDetail({ component: 'leaf', at: root });
    })
    .defineWeighted('branchOrLeaf', 4, (root: Point, instance: GeneratorInstance) => {
        instance.addDetail({ component: 'branch', at: root });
        instance.addDetail({ component: 'maybeBranch', at: root });
        instance.addDetail({ component: 'maybeBranch', at: root });
    })
    .define('leaf', (root: Point, instance: GeneratorInstance) => {
        const leaf = instance.add(root.attach(leafSphere));
        leaf.scale(Math.random() * 0.5 + 0.5);
    })
    .maybe('maybeBranch', (root: Point, instance: GeneratorInstance) => {
        instance.addDetail({ component: 'branch', at: root });
    });

const guidingVectors = CostFunction.guidingVectors([
    new Bezier([
        {x: 0, y: 0, z: 0},
        {x: 0, y: 1, z: 0},
        {x: 1, y: 1, z: 1},
        {x: 2, y: 2, z: 1}
    ]),
    new Bezier([
        {x: 0, y: 1, z: 0},
        {x: 0.5, y: 2, z: 1},
        {x: 0, y: 3, z: 1},
        {x: 0, y: 3, z: 2}
    ])
]);

const vectorField = guidingVectors.generateVectorField();
const guidingCurve = guidingVectors.generateGuidingCurve();

const tree = treeGen.generateSOSMC({
    start: 'branch',
    sosmcDepth: 100,
    finalDepth: 100,
    samples: 100,
    costFn: guidingVectors,
    onLastGeneration: (instances: GeneratorInstance[]) => {
        const result = document.createElement('p');
        result.innerText = 'Costs in final generation: ';
        result.innerText += instances
            .map((instance: GeneratorInstance) => instance.getCost().realCost)
            .sort((a: number, b: number) => a - b)
            .map((cost: number) => Math.round(cost * 100) / 100)
            .join(', ');
        document.body.appendChild(result);
    }
});

/*const treeTarget = Model.create();
const sphere = treeTarget.add(new GeometryNode(leafSphere));
sphere.moveTo({ x: 0, y: 3, z: 0 });
const branch = treeTarget.add(new GeometryNode(branchShape));
branch.scale({ x: 0.2, y: 2, z: 0.2 });
branch.moveTo({ x: 0, y: 1, z: 0 });

const tree = treeGen.generateSOSMC({
    start: 'branch',
    sosmcDepth: 50,
    finalDepth: 200,
    samples: 100,
    costFn: CostFunction.fillVolume(treeTarget, 1),
    onLastGeneration: (instances: GeneratorInstance[]) => {
        const result = document.createElement('p');
        result.innerText = 'Costs in final generation: ';
        result.innerText += instances
            .map((instance: GeneratorInstance) => instance.getCost().realCost)
            .sort((a: number, b: number) => a - b)
            .map((cost: number) => Math.round(cost * 100) / 100)
            .join(', ');
        document.body.appendChild(result);
    }
});*/

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 3: set up renderer
///////////////////////////////////////////////////////////////////////////////////////////////////

document.body.appendChild(renderer.stage);

renderer.camera.lookAt({ x: 0, y: 1, z: 0 });

// Draw the armature
let angle = 0;
const draw = () => {
    angle += 0.001;
    renderer.camera.moveToWithFixedTarget({
        x: Math.cos(angle) * 8,
        y: 1,
        z: -Math.sin(angle) * 8,
    })
    //tree.root().setRotation(Matrix.fromQuat4(Quaternion.fromEuler(0, angle, 0)));

    return {
        objects: [tree],
        debugParams: {
            drawAxes: true,
            drawArmatureBones: false,
            drawVectorField: vectorField,
            drawGuidingCurve: guidingCurve
        }
    };
};

// Apply the constraints each frame.
renderer.eachFrame(draw);
