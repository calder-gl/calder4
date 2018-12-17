import { mat3, mat4, vec3, vec4 } from 'gl-matrix';

import { Color } from '../colors/Color';
import { AABB } from '../geometry/BakedGeometry';
import { BakedMaterial } from '../renderer/Material';
import { RenderObject } from '../types/RenderObject';
import { worldSpaceAABB } from '../utils/aabb';
import { importObj } from './Import';
import { GeometryNode, Node } from './Node';
import { NodeRenderObject } from './NodeRenderObject';

import { chunk, flatMap } from 'lodash';

type RenderInfo = {
    /**
     * The position transformation matrix for a node's coordinate space.
     */
    currentMatrix: mat4;

    /**
     * The normal transformation matrix for a node's coordinate space.
     */
    currentNormalMatrix: mat3;

    /**
     * The geometry and bones to be rendered from a node.
     */
    objects: NodeRenderObject;
};

type NodeLink = {
    node: Node;
    next: NodeLink | null;
};

class Nodes {
    private root: Node;
    private last: NodeLink;
    private _length: number;

    constructor() {
        this.root = new Node();
        this.last = { node: this.root, next: null };
        this._length = 1;
    }

    get length(): number {
        return this._length;
    }

    public getRoot(): Node {
        return this.root;
    }

    public getLatest(): Node {
        return this.last.node;
    }

    public add(node: Node) {
        this.last = { node, next: this.last };
        this._length += 1;
    }

    public forEach(callback: (node: Node, i: number) => void) {
        let i = 0;
        let nodeLink: NodeLink | null = this.last;
        while (nodeLink !== null) {
            callback(nodeLink.node, i);
            i += 1;
            nodeLink = nodeLink.next;
        }
    }

    public nMostRecent(n: number): Node[] {
        const list: Node[] = [];

        let i = 0;
        let nodeLink: NodeLink | null = this.last;
        while (nodeLink !== null && i < n) {
            list.push(nodeLink.node);
            i += 1;
            nodeLink = nodeLink.next;
        }

        return list;
    }

    public clone(): Nodes {
        const cloned = new Nodes();
        cloned.root = this.root;
        cloned.last = this.last;
        cloned._length = this._length;

        return cloned;
    }

    public cloneDeep(): Nodes {
        const parentToChildren: Map<Node, Node[]> = new Map<Node, Node[]>();
        const nodeToClone: Map<Node, Node> = new Map<Node, Node>();
        const nodesInOrder: Node[] = [];
        this.forEach((node: Node) => {
            const clone = node.clone();
            nodeToClone.set(node, clone);
            nodesInOrder.unshift(node);

            if (node.parent === null) {
                return;
            }
            let children = parentToChildren.get(node.parent);
            if (children === undefined) {
                children = [];
                parentToChildren.set(node.parent, children);
            }
            children.push(clone);
        });

        this.forEach((node: Node) => {
            const children = parentToChildren.get(node);
            const clone = <Node>nodeToClone.get(node);
            if (children !== undefined) {
                children.forEach((child: Node) => clone.addChild(child));
            }
        });

        const deepClone = new Nodes();
        deepClone.root = <Node>nodeToClone.get(this.root);
        deepClone.last = { node: deepClone.root, next: null };

        // We already set the root, now add the rest
        nodesInOrder.slice(1).forEach((node: Node) => {
            const clone = <Node>nodeToClone.get(node);
            deepClone.add(clone);
        });

        return deepClone;
    }
}

/**
 * A set of connected armature nodes, enabling efficient creation of a copy that one can add to
 * without modifying the original. Nodes have connections to the parent that they are connected
 * to and not to their children, so new nodes can be added that refer to parents without the parents
 * needing to be modified.
 */
export class Model {
    /**
     * The collection of connected nodes.
     */
    public readonly nodes: Nodes;

    /**
     * Creates a new model.
     *
     * @param {Nodes} nodes A set of nodes which, if passed in, are used to initialize the model.
     */
    constructor(nodes: Nodes = new Nodes()) {
        this.nodes = nodes;
    }

    /**
     * Read data from the import_dir and produce a new model.
     *
     * @return {Model} model A model representing that described in .obj and .mtl format in the
     * import_dir directory.
     */
    public static importObj(objData: string, mtlData: string): Model {
        const nodes = importObj(objData, mtlData);

        const model = new Model();
        model.root().addChild(nodes[0]);
        nodes.forEach((node: Node) => model.add(node));

        return model;
    }

    /**
     * Creates a new model.
     *
     * @param {Nodes | undefined} nodes A set of nodes which, if passed in, are used to initialize
     * the model.
     * @returns {Model} The new model.
     */
    public static create(nodes?: Nodes): Model {
        return new Model(nodes);
    }

    /**
     * @returns A copy of the current model that has all the same nodes, but can be added to.
     */
    public clone() {
        return new Model(this.nodes.clone());
    }

    /**
     * @returns A deep copy of the current model that has all the same nodes, but can be added to.
     */
    public cloneDeep() {
        return new Model(this.nodes.cloneDeep());
    }

    /**
     * Adds a node to the model.
     *
     * @param {Node} node The node to add.
     * @returns Node The added node, for convenience.
     */
    public add(node: Node): Node {
        this.nodes.add(node);

        return node;
    }

    /**
     * @returns {Node} The first node added to the model, which is therefore the root node.
     */
    public root(): Node {
        return this.nodes.getRoot();
    }

    /**
     * @returns {Node} The most recently added node to the model.
     */
    public latest(): Node {
        return this.nodes.getLatest();
    }

    /**
     * Walks through all the nodes in the model, generating buffers to send to the renderer.
     *
     * @param {boolean} makeBones Whether or not to generate buffers for bones in addition to
     * geometry.
     * @returns NodeRenderObject The info needed by the renderer to visualize this model.
     */
    public computeRenderInfo(makeBones: boolean): NodeRenderObject {
        // In order to render a child, we have to know its parent's transformation. We don't want
        // to recompute this any more times than we have to, so we keep a cache of this information
        // for each node in the form of a `RenderInfo`
        const renderCache: Map<Node, RenderInfo> = new Map<Node, RenderInfo>();

        // Nodes yet to be added to the `NodeRenderObject` result.
        const renderStack: Node[] = [];
        this.nodes.forEach((node: Node) => renderStack.unshift(node));

        const result: NodeRenderObject = { geometry: [], bones: [] };

        while (renderStack.length > 0) {
            const node = <Node>renderStack.pop();

            if (renderCache.has(node)) {
                continue;
            }

            if (node.parent === null) {
                // If the node has no parent, its parent transforms are identity matrices
                const info = node.computeRenderInfo(mat4.create(), mat3.create(), makeBones);

                // Cache this info so it can be used for the node's children
                renderCache.set(node, info);

                // Add to the result
                result.geometry.push(...info.objects.geometry);
                result.bones.push(...info.objects.bones);
            } else if (renderCache.has(node.parent)) {
                // If the node's parent has already been rendered, we can read its transformation
                // information from the cache
                const { currentMatrix, currentNormalMatrix } = <RenderInfo>renderCache.get(
                    node.parent
                );
                const info = node.computeRenderInfo(currentMatrix, currentNormalMatrix, makeBones);

                // Cache this info so it can be used for the node's children
                renderCache.set(node, info);

                // Add to the result
                result.geometry.push(...info.objects.geometry);
                result.bones.push(...info.objects.bones);
            } else {
                // Otherwise, we need to render the parent before the current node. Add both back
                // to the list, but with the parent closer to the top, so that it gets rendered
                // first.
                renderStack.push(node, node.parent);
            }
        }

        return result;
    }

    /**
     * @returns {AABB} A model-space axis-aligned bounding box that contains the whole model.
     */
    public computeAABB(): AABB {
        const min = vec4.fromValues(Infinity, Infinity, Infinity, 1);
        const max = vec4.fromValues(-Infinity, -Infinity, -Infinity, 1);

        this.nodes.forEach((n: Node) =>
            n.geometryCallback((node: GeometryNode) => {
                const aabb = worldSpaceAABB(node, node.geometry.aabb);

                min[0] = Math.min(Math.min(min[0], aabb.min[0]), aabb.max[0]);
                min[1] = Math.min(Math.min(min[1], aabb.min[1]), aabb.max[1]);
                min[2] = Math.min(Math.min(min[2], aabb.min[2]), aabb.max[2]);

                max[0] = Math.max(Math.max(max[0], aabb.min[0]), aabb.max[0]);
                max[1] = Math.max(Math.max(max[1], aabb.min[1]), aabb.max[1]);
                max[2] = Math.max(Math.max(max[2], aabb.min[2]), aabb.max[2]);
            })
        );

        return { min, max };
    }

    /**
     * Given an ambient scene colour, this exports a model in a format traditional 3D software
     * can read, the .obj file.
     *
     * .obj spec: http://paulbourke.net/dataformats/obj/
     * .mtl spec: http://paulbourke.net/dataformats/mtl/
     *
     * @param {string} name The name of the model, onto which .obj and .mtl will be appended.
     * @param {Color} ambientLightColor The scene's ambient component, added to materials.
     * @returns {{obj: string; mtl: string}} The source code for the .obj file for geometry and
     * the corresponding .mtl file for materials.
     */
    public exportOBJ(name: string, ambientLightColor: Color): { obj: string; mtl: string } {
        const vertices: vec4[] = [];
        const normals: vec3[] = [];
        const groups: { indices: number[][]; material: number }[] = [];
        const materialIndices: Map<BakedMaterial, number> = new Map<BakedMaterial, number>();
        const materials: BakedMaterial[] = [];

        this.computeRenderInfo(false).geometry.forEach((r: RenderObject) => {
            // Give each material a unique number representing it. If a material has already been
            // given a number, don't add it again, ensuring there are no duplicates.
            if (!materialIndices.has(r.geometry.material)) {
                materialIndices.set(r.geometry.material, materials.length);
                materials.push(r.geometry.material);
            }

            // Add the vertex indices to a group with the specified material
            groups.push({
                // Use an array literal and ... to convert the int16 array to doubles
                indices: chunk(
                    [...r.geometry.indices].map((i: number) => i + vertices.length + 1),
                    3
                ),
                material: <number>materialIndices.get(r.geometry.material)
            });

            // Add vertex and normals, transformed into world space
            vertices.push(
                ...chunk(r.geometry.vertices, 3).map(([x, y, z]: number[]) =>
                    vec4.transformMat4(vec4.create(), vec4.fromValues(x, y, z, 1), r.transform)
                )
            );
            normals.push(
                ...chunk(r.geometry.normals, 3).map(([x, y, z]: number[]) =>
                    vec3.transformMat3(vec3.create(), vec3.fromValues(x, y, z), r.normalTransform)
                )
            );
        });

        const obj = [
            `o ${name}`,

            // Source the corresponding material file
            `mtllib ${name}.mtl`,

            // List all vertices and normals
            ...vertices.map(
                (v: vec4) => `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`
            ),
            ...normals.map(
                (v: vec3) => `vn ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`
            ),

            // Create a group for each distinct object, with the proper material applied
            ...flatMap(groups, (g: { indices: number[][]; material: number }, i: number) => [
                `g group${i}`,

                `usemtl material${g.material}`,
                ...g.indices.map(
                    (idx: number[]) =>
                        `f ${idx[0]}//${idx[0]} ${idx[1]}//${idx[1]} ${idx[2]}//${idx[2]}`
                )
            ])
        ].join('\n');

        const ambient = ambientLightColor.asVec();
        const mtl = flatMap(materials, (m: BakedMaterial, i: number) => [
            `newmtl material${i}`,
            `Ka ${ambient[0].toFixed(4)} ${ambient[1].toFixed(4)} ${ambient[2].toFixed(4)}`,

            // In our shading model, diffuse and specular color are the same
            `Kd ${m.materialColor[0].toFixed(4)} ${m.materialColor[1].toFixed(
                4
            )} ${m.materialColor[2].toFixed(4)}`,
            `Ks ${m.materialColor[0].toFixed(4)} ${m.materialColor[1].toFixed(
                4
            )} ${m.materialColor[2].toFixed(4)}`,

            `Ns ${m.materialShininess.toFixed(4)}`,

            // Specify that we want highlights in our illumination model
            'illum 2'
        ]).join('\n');

        return { obj, mtl };
    }
}
