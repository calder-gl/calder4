import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import { BakedGeometry } from '../geometry/BakedGeometry';
import { closestPointOnLine, vec3From4, vec3ToPoint } from '../math/utils';
import { RenderObject } from '../renderer/interfaces/RenderObject';
import { NodeRenderObject } from './NodeRenderObject';
import { Transformation } from './Transformation';

/**
 * A `Node` in a scene-graph.
 */
export class Node {
    private static boneVertices: vec3[] = [
        vec3.fromValues(0, 0, 0),
        vec3.fromValues(0.5, 0.1, 0),
        vec3.fromValues(0.5, 0, -0.1),
        vec3.fromValues(0.5, -0.1, 0),
        vec3.fromValues(0.5, 0, 0.1),
        vec3.fromValues(1, 0, 0)
    ];

    private static bone: BakedGeometry = {
        vertices: Node.boneVertices,
        normals: [
            vec3.fromValues(-1, 0, 0),
            vec3.fromValues(0, 1, 0),
            vec3.fromValues(0, 0, -1),
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, 0, 1),
            vec3.fromValues(1, 0, 0)
        ],
        indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4],

        // Map x, y, z to r, g, b to give a sense of bone orientation
        colors: Node.boneVertices.map((v: vec3) =>
            vec3.fromValues(v[0], v[1] / 0.1 + 0.1, v[2] / 0.1 + 0.1)
        )
    };

    public readonly children: Node[];
    protected parent: Node | null = null;
    protected transformation: Transformation = new Transformation();
    private points: { [key: string]: Point } = {};
    private anchor: vec3 | null = null;
    private held: vec3[] = [];
    private grabbed: vec3 | null = null;

    /**
     * Instantiates a new `Node`.
     *
     * @param {Node[]} children
     */
    constructor(children: Node[] = []) {
        this.children = children;
    }

    public createPoint(name: string, position: vec3) {
        // tslint:disable-next-line:no-use-before-declare
        this.points[name] = new Point(this, position);
    }

    public point(name: string): Point {
        const point = this.points[name];
        if (point === undefined) {
            throw new Error(`Could not find a point named ${name}`);
        }

        return point;
    }

    /**
     * Holds the current node in place at a given point so that it can be manipulated about
     * that point.
     *
     * @param {Point | vec3} point The point to be held, either as a local coordinate, or a
     * control point on the current or any other node.
     * @returns {Node} The current node, for method chaining.
     */
    public hold(point: Point | vec3): Node {
        this.held.push(this.localPointCoordinate(point));

        return this;
    }

    /**
     * Removes all held points so that new transformation constraints can be applied.
     *
     * @returns {Node} The current node, for method chaining.
     */
    public release(): Node {
        this.held = [];
        this.grabbed = null;

        return this;
    }

    /**
     * Marks a point as grabbed so that it can be used to push or pull the node
     *
     * @param {Point | vec3} point The point to grab.
     * @returns {Node} The current node, for method chaining.
     */
    public grab(point: Point | vec3): Node {
        this.grabbed = this.localPointCoordinate(point);

        return this;
    }

    /**
     * Given the current constraints on the node, rotates the node to look at a point.
     *
     * @param {Point | vec3} point The point to rotate towards.
     */
    public pointAt(point: Point | vec3): Node {
        if (this.grabbed === null) {
            throw new Error('You must grab a point before pointing it at something');
        }

        // Constrained points must stay in the same location before and after the rotation
        const constrainedPoints: vec3[] = [...this.held];

        // If the node is attached to a parent node with an anchor, add it to the list of
        // constrained points.
        if (this.anchor !== null) {
            constrainedPoints.push(this.anchor);
        }

        // Bring the target point into local coordinates
        const target3 = this.localPointCoordinate(point);

        // Use the last constrained point as an anchor. If this node was attached to a parent, then
        // this will be `this.anchor`. Otherwise, it will be some other arbitrary held point.
        const anchor3 = constrainedPoints.pop();
        if (anchor3 === undefined) {
            throw new Error('At least one point must be held or attached to another node');
        }

        if (constrainedPoints.length === 0) {
            // After having popped one constrained point, if there are no remaining points, then
            // there are two degrees of freedom
            this.rotateTo2Degrees(anchor3, target3, this.grabbed);
        } else if (constrainedPoints.length === 1) {
            // After having popped one constraine dpoint, if there is another remaining point, then
            // we only have one degree of freedom, so rotation will be about the axis between the
            // anchor point and the remaining constrained point
            this.rotateTo1Degree(anchor3, target3, this.grabbed, constrainedPoints[0]);
        } else {
            throw new Error(
                `There are too many held points (${
                    constrainedPoints.length
                }), so the node can't be rotated`
            );
        }

        return this;
    }

    public rotateTo1Degree(anchor3: vec3, target3: vec3, grabbed3: vec3, held3: vec3) {
        const target = vec3ToPoint(target3);
        const anchor = vec3ToPoint(anchor3);
        const grabbed = vec3ToPoint(grabbed3);
        const scaleMatrix = mat4.fromScaling(mat4.create(), this.getScale());

        // Compute the axis between the two constrained points
        const heldAxis = vec4.sub(vec4.create(), vec3ToPoint(held3), anchor);
        vec4.normalize(heldAxis, heldAxis);

        // Get the vector from the axis to the grabbed point
        const closestOnAxisToGrab = closestPointOnLine(grabbed, anchor, heldAxis);
        const toGrabbed = vec4.sub(vec4.create(), grabbed, closestOnAxisToGrab);

        // Get the vector from the axis to the target
        const closestOnAxisToTarget = closestPointOnLine(target, anchor, heldAxis);
        const toTarget = vec4.sub(vec4.create(), target, closestOnAxisToTarget);

        // Rotation gets applied before scale, so we want to undo this node's scale before
        // calculating the new rotation
        vec4.transformMat4(toGrabbed, toGrabbed, scaleMatrix);
        vec4.transformMat4(toTarget, toTarget, scaleMatrix);

        // Normalize direction vectors
        const toGrabbed3 = vec3From4(toGrabbed);
        const toTarget3 = vec3From4(toTarget);
        vec3.normalize(toGrabbed3, toGrabbed3);
        vec3.normalize(toTarget3, toTarget3);

        // Move the center of rotation to the anchor
        const incRotation = mat4.fromTranslation(
            mat4.create(),
            vec3.sub(vec3.create(), vec3.create(), anchor3)
        );

        // Add a rotation equal to the shortest rotation from the vector of the anchor to the grab
        // point to the vector from the anchor to the target point
        mat4.multiply(
            incRotation,
            mat4.fromQuat(mat4.create(), quat.rotationTo(quat.create(), toGrabbed3, toTarget3)),
            incRotation
        );

        // Shift the center back again
        mat4.translate(incRotation, incRotation, anchor3);

        this.setRotation(mat4.multiply(mat4.create(), this.getRotation(), incRotation));
    }

    public rotateTo2Degrees(anchor3: vec3, target3: vec3, grabbed3: vec3) {
        const scaleMatrix = mat4.fromScaling(mat4.create(), this.getScale());
        const grabbed = vec3ToPoint(grabbed3);
        const target = vec3ToPoint(target3);
        const anchor = vec3ToPoint(anchor3);

        // Rotation gets applied before scale, so we want to undo this node's scale before
        // calculating the new rotation
        vec4.transformMat4(grabbed, grabbed, scaleMatrix);
        vec4.transformMat4(target, target, scaleMatrix);
        vec4.transformMat4(anchor, anchor, scaleMatrix);

        // Create vectors going from the anchor to the
        const toGrabbed = vec4.sub(vec4.create(), grabbed, anchor);
        const toTarget = vec4.sub(vec4.create(), target, anchor);

        // Normalize direction vectors
        const toGrabbed3 = vec3From4(toGrabbed);
        const toTarget3 = vec3From4(toTarget);
        vec3.normalize(toGrabbed3, toGrabbed3);
        vec3.normalize(toTarget3, toTarget3);

        // Move the center of rotation to the anchor
        const incRotation = mat4.fromTranslation(
            mat4.create(),
            vec3.sub(vec3.create(), vec3.create(), anchor3)
        );

        // Add a rotation equal to the shortest rotation from the vector of the anchor to the grab
        // point to the vector from the anchor to the target point
        mat4.multiply(
            incRotation,
            mat4.fromQuat(mat4.create(), quat.rotationTo(quat.create(), toGrabbed3, toTarget3)),
            incRotation
        );

        // Shift the center back again
        mat4.translate(incRotation, incRotation, anchor3);

        this.setRotation(mat4.multiply(mat4.create(), this.getRotation(), incRotation));
    }

    public addChild(child: Node) {
        this.children.push(child);
        child.parent = this;
    }

    /**
     * Sets a fixed point that must not change position. This is like a held point, but it persists
     * between operations. This is used when the node is added as a child of another node.
     *
     * @param {vec3 | null} position The point to fix in place.
     */
    public setAnchor(position: vec3 | null) {
        this.anchor = position;
    }

    /**
     * Gets the node's rotation.
     *
     * @returns {mat4}
     */
    public getRotation(): mat4 {
        return this.transformation.rotation;
    }

    /**
     * Sets the rotation for the node by updating the private `transformation`
     * property.
     *
     * @param {mat4} rotation
     */
    public setRotation(rotation: mat4) {
        this.transformation.rotation = rotation;
    }

    /**
     * Gets the node's scale.
     *
     * @returns {vec3}
     */
    public getScale(): vec3 {
        return this.transformation.scale;
    }

    /**
     * Sets the scale for the node by updating the private `transformation` property.
     *
     * @param {vec3} scale
     */
    public setScale(scale: vec3) {
        this.transformation.scale = scale;
    }

    /**
     * Gets the node's position.
     *
     * @returns {vec3}
     */
    public getPosition(): vec3 {
        return this.transformation.position;
    }

    /**
     * Sets the position for the node by updating the private `transformation`
     * property.
     *
     * @param {vec3} position
     */
    public setPosition(position: vec3) {
        this.transformation.position = position;
    }

    /**
     * @returns {mat4} A matrix that brings local coordinate into the parent coordinate space.
     */
    public getTransformation(): mat4 {
        const transform = mat4.fromTranslation(mat4.create(), this.transformation.position);
        if (this.parent !== null) {
            mat4.scale(transform, transform, vec3.inverse(vec3.create(), this.parent.getScale()));
        }
        mat4.multiply(transform, transform, this.transformation.rotation);
        mat4.scale(transform, transform, this.transformation.scale);

        return transform;
    }

    /**
     * @returns {mat4} A matrix that brings local coordinates into the global coordinate
     * space.
     */
    public localToGlobalTransform(): mat4 {
        const transform = this.transformation.getTransformation();
        if (this.parent !== null) {
            mat4.multiply(transform, this.parent.localToGlobalTransform(), transform);
        }

        return transform;
    }

    /**
     * @returns {mat4} A matrix that brings global coordinates into the local coordinate
     * space.
     */
    public globalToLocalTransform(): mat4 {
        const transform = this.transformation.getTransformation();
        mat4.invert(transform, transform);

        if (this.parent !== null) {
            mat4.multiply(transform, transform, this.parent.globalToLocalTransform());
        }

        return transform;
    }

    /**
     * Returns an array of `RenderObject`s denoting `GeometryNode`s
     * transformations multiplied by the `coordinateSpace` parameter.
     *
     * @param {mat4} coordinateSpace The coordinate space this node resides in.
     * @param {boolean} isRoot Whether or not this node is attached to another armature node.
     * @param {boolean} makeBones Whether or not the armature heirarchy should be visualized.
     * @returns {NodeRenderObject} The geometry for this armature subtree, and possibly geometry
     * representing the armature itself.
     */
    public traverse(coordinateSpace: mat4, isRoot: boolean, makeBones: boolean): NodeRenderObject {
        return this.traverseChildren(coordinateSpace, isRoot, makeBones).objects;
    }

    /**
     * Generates `RenderObject`s for this node's children, plus a bone for this node, if specified.
     * The current node's transformation matrix is also returned so that additional `RenderObject`s
     * can be added to the result if needed without recomputing this matrix.
     */
    protected traverseChildren(
        parentMatrix: mat4,
        isRoot: boolean,
        makeBones: boolean
    ): { currentMatrix: mat4; objects: NodeRenderObject } {
        const currentMatrix = this.transformation.getTransformation();
        mat4.multiply(currentMatrix, parentMatrix, currentMatrix);

        const objects: NodeRenderObject = this.children.reduce(
            (accum: NodeRenderObject, child: Node) => {
                const childRenderObject: NodeRenderObject = child.traverse(
                    currentMatrix,
                    false,
                    makeBones
                );

                // Merge the geometry and bones from each child into one long list of geometry and
                // one long list of bones for all children
                accum.geometry.push(...childRenderObject.geometry);
                accum.bones.push(...childRenderObject.bones);

                return accum;
            },
            { geometry: [], bones: [] }
        );

        if (makeBones && !isRoot) {
            objects.bones.push(this.boneRenderObject(parentMatrix));
        }

        return { currentMatrix, objects };
    }

    /**
     * Create a RenderObject visualizing this armature node relative to its parent.
     *
     * @param {mat4} parentMatrix A matrix to translate points into the coordinate space of the
     * parent node.
     * @returns {RenderObject} A RenderObject for a bone stretching from the parent node's origin
     * to the current node's origin.
     */
    protected boneRenderObject(parentMatrix: mat4): RenderObject {
        const transform: Transformation = new Transformation(
            // Since the bone will start at the parent node's origin, we do not need to translate it
            vec3.fromValues(0, 0, 0),

            // Rotate the bone so it points from the parent node's origin to the current node's
            // origin
            mat4.fromQuat(
                mat4.create(),
                quat.rotationTo(
                    quat.create(),
                    vec3.fromValues(1, 0, 0),
                    vec3.normalize(vec3.create(), this.transformation.position)
                )
            ),

            // Scale the bone so its length is equal to the length between the parent node's origin
            // and the current node's origin
            vec3.fromValues(
                Math.sqrt(
                    Math.pow(this.transformation.position[0], 2) +
                        Math.pow(this.transformation.position[1], 2) +
                        Math.pow(this.transformation.position[2], 2)
                ),
                1,
                1
            )
        );
        const transformationMatrix = mat4.create();
        mat4.multiply(transformationMatrix, parentMatrix, transform.getTransformation());

        return { ...Node.bone, transform: transformationMatrix, isShadeless: true };
    }

    /**
     * Given a point, convert it into the local coordinate space of the current node.
     *
     * @param {Point | vec3} point The point to convert. A raw vec3 is considered to be in global
     * coordinate space.
     * @returns {vec3} The point in the current node's local coordinate space.
     */
    private localPointCoordinate(point: Point | vec3): vec3 {
        // tslint:disable-next-line:no-use-before-declare
        const pointRelative = vec3ToPoint(point instanceof Point ? point.position : point);

        const pointToLocal = mat4.create();

        // tslint:disable-next-line:no-use-before-declare
        if (point instanceof Point && point.node !== this) {
            // If the point was given in a coordinate space other than this node's space, first bring
            // it out of its own node's space into global space
            mat4.multiply(pointToLocal, point.node.localToGlobalTransform(), pointToLocal);
        }

        // tslint:disable-next-line:no-use-before-declare
        if (!(point instanceof Point) || point.node !== this) {
            // If the point was given in a coordenate space other than this node's space, it is now
            // in global space after the previous matrix multiply, so we now need to bring it from
            // global into this node's local space.
            mat4.multiply(pointToLocal, this.globalToLocalTransform(), pointToLocal);
            //mat4.scale(pointToLocal, pointToLocal, this.getScale());
        }

        const local = vec4.transformMat4(vec4.create(), pointRelative, pointToLocal);

        return vec3From4(local);
    }
}

/**
 * A derived `Node` with an additional `geometry` property.
 */
export class GeometryNode extends Node {
    public readonly geometry: BakedGeometry;

    /**
     * Instantiates a new `GeometryNode`.
     *
     * @param {BakedGeometry} geometry
     * @param {Node[]} children
     */
    constructor(geometry: BakedGeometry, children: Node[] = []) {
        super(children);
        this.geometry = geometry;
    }

    /**
     * Returns an array of `RenderObject`s denoting `GeometryNode`s
     * transformations multiplied by the `coordinateSpace` parameter.
     *
     * @param {mat4} coordinateSpace The coordinate space this node resides in.
     * @param {boolean} isRoot Whether or not this node is attached to another armature node.
     * @param {boolean} makeBones Whether or not the armature heirarchy should be visualized.
     * @returns {NodeRenderObject} The geometry for this armature subtree, and possibly geometry
     * representing the armature itself.
     */
    public traverse(coordinateSpace: mat4, isRoot: boolean, makeBones: boolean): NodeRenderObject {
        const { currentMatrix, objects } = this.traverseChildren(
            coordinateSpace,
            isRoot,
            makeBones
        );
        objects.geometry.push({ ...this.geometry, transform: currentMatrix });

        return objects;
    }
}

/**
 * A point on an armature that other armature nodes can attach to.
 */
class Point {
    public readonly node: Node;
    public readonly position: vec3;

    /**
     * @param {Node} node The node that this point is in the coordinate space of.
     * @param {vec3} position The position of this point relative to its node's origin.
     */
    constructor(node: Node, position: vec3) {
        this.node = node;
        this.position = position;
    }

    /**
     * Attaches the current node to the specified target node at the given point.
     *
     * @param {Point} target The point on another node that the current one should be attached to.
     */
    public stickTo(target: Point) {
        if (target.node === this.node) {
            throw new Error('Cannot attach a point to another point on the same node');
        }
        target.node.addChild(this.node);
        this.node.setAnchor(this.position);
        this.node.setPosition(vec3.subtract(vec3.create(), target.position, this.position));
    }

    /**
     * Attaches the specified geometry to the current point on a node.
     *
     * @param {BakedGeometry} geometry The geometry to attach to the current point.
     */
    public attach(geometry: BakedGeometry) {
        const geometryNode = new GeometryNode(geometry);
        geometryNode.setAnchor(vec3.fromValues(0, 0, 0));
        geometryNode.setPosition(this.position);
        this.node.addChild(geometryNode);
    }
}
