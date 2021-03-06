import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import {
    defaultMaterial,
    Armature,
    Face,
    GeometryNode,
    Model,
    Node,
    RenderObject,
    WorkingGeometry
} from '../../src/calder';
import '../glMatrix';

const bone = Armature.define((root: Node) => {
    root.createPoint('base', { x: 0, y: 0, z: 0 });
    root.createPoint('tip', { x: 0, y: 1, z: 0 });
});

describe('Node', () => {
    describe('globalToLocalTransform', () => {
        it('does nothing if there is no transform', () => {
            const node = bone();
            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.globalToLocalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('respects translations', () => {
            const node = bone();
            node.setPosition({ x: 1, y: 1, z: 1 });

            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.globalToLocalTransform());

            expect(point).toEqualVec4(vec4.fromValues(0, -1, -1, 1));
        });

        it('respects rotations', () => {
            const node = bone();
            node.setRotation(mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 0, 90, 0)));

            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.globalToLocalTransform());

            expect(point).toEqualVec4(vec4.fromValues(0, 0, 1, 1));
        });

        it('respects scale', () => {
            const node = bone();
            node.setScale(mat4.fromScaling(mat4.create(), vec3.fromValues(2, 1, 1)));

            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.globalToLocalTransform());

            expect(point).toEqualVec4(vec4.fromValues(0.5, 0, 0, 1));
        });

        it('works with nested bones', () => {
            const parent = bone();
            const node = bone();
            node.point('base').stickTo(parent.point('tip'));

            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.globalToLocalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, -1, 0, 1));
        });
    });

    describe('localToGlobalTransform', () => {
        it('does nothing if there is no transform', () => {
            const node = bone();
            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('respects translations', () => {
            const node = bone();
            node.setPosition({ x: 1, y: 1, z: 1 });

            const point = vec4.fromValues(0, -1, -1, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('respects rotations', () => {
            const node = bone();
            node.setRotation(mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 0, 90, 0)));

            const point = vec4.fromValues(0, 0, 1, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('respects scale', () => {
            const node = bone();
            node.setScale(mat4.fromScaling(mat4.create(), vec3.fromValues(2, 1, 1)));

            const point = vec4.fromValues(0.5, 0, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('works with nested bones', () => {
            const parent = bone();
            const node = bone();
            node.point('base').stickTo(parent.point('tip'));

            const point = vec4.fromValues(1, -1, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(vec4.fromValues(1, 0, 0, 1));
        });

        it('works with nested bones with transforms applied', () => {
            const parent = bone();
            parent.setRotation(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 45, 0, 0))
            );

            const node = bone();
            node.setRotation(mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 45, 0, 0)));
            node.point('base').stickTo(parent.point('tip'));

            const point = vec4.fromValues(0, 1, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());

            expect(point).toEqualVec4(
                vec4.fromValues(0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4) + 1, 1)
            );
        });
    });

    describe('stickTo', () => {
        it('positions the current node in the proper position in the parent coordinate space', () => {
            const parent = bone();
            const child = bone();

            child.point('base').stickTo(parent.point('tip'));
            expect(child.parent).toBe(parent);
            expect(child.getPosition()).toEqualVec3(vec3.fromValues(0, 1, 0));
        });
    });

    describe('attach', () => {
        it('creates a GeometryNode for the attached geometry', () => {
            const parent = bone();
            const geometry: WorkingGeometry = new WorkingGeometry({
                vertices: [vec3.create()],
                normals: [vec3.create()],
                faces: [new Face([], [])],
                controlPoints: [vec3.create()],
                material: defaultMaterial
            });

            const geometryNode = parent.point('tip').attach(geometry);
            expect(geometryNode.parent).toBe(parent);
            expect(geometryNode.getPosition()).toEqualVec3(vec3.fromValues(0, 1, 0));
        });
    });

    describe('moveTo', () => {
        it('moves the origin when no point is grabbed', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 2, z: 2 });

            node.moveTo(other.point('tip'));

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(2, 3, 2));
        });

        it('moves from a grabbed point', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 2, z: 2 });

            node
                .grab(node.point('tip'))
                .moveTo(other.point('tip'))
                .release();

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(2, 2, 2));
        });

        it('moves from a grabbed point when rotated', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 0, z: 0 });

            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .pointAt(other.point('base'))
                .release();
            node
                .grab(node.point('tip'))
                .moveTo(other.point('tip'))
                .release();

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(1, 1, 0));
        });

        it('moves from a grabbed point when rotated and scaled', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 0, z: 0 });

            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .stretchTo(other.point('base'))
                .release();
            node
                .grab(node.point('tip'))
                .moveTo(other.point('tip'))
                .release();

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(0, 1, 0));
        });
    });

    describe('moveTowards', () => {
        it('moves the specified distance', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 0, z: 0 });

            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .stretchTo(other.point('base'))
                .release();
            node
                .grab(node.point('tip'))
                .moveTowards(other.point('tip'), 0.5)
                .release();

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(0, 0.5, 0));
        });
    });

    describe('moveBy', () => {
        it('moves by the specified amount', () => {
            const node = bone();
            const other = bone();
            other.setPosition({ x: 2, y: 0, z: 0 });

            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .stretchTo(other.point('base'))
                .release();

            node.moveBy({ x: 0, y: 0.5, z: 0 });

            expect(node.getPosition()).toEqualVec3(vec3.fromValues(0, 0.5, 0));
        });
    });

    describe('scale', () => {
        it('scales by the given amount', () => {
            const node = bone();
            node.scale(2);

            const point = vec4.fromValues(0, 1, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());
            expect(point).toEqualVec4(vec4.fromValues(0, 2, 0, 1));
        });

        it('scales about a point', () => {
            const node = bone();
            node.hold(node.point('tip')).scale(2);

            const point = vec4.fromValues(0, 0, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());
            expect(point).toEqualVec4(vec4.fromValues(0, -1, 0, 1));
        });
    });

    describe('rotate', () => {
        it('rotates about an axis', () => {
            const node = bone();

            node
                .hold(node.point('base'))
                .hold(node.point('tip'))
                .rotate(90)
                .release();

            const point = vec4.fromValues(1, 0, 0, 1);
            vec4.transformMat4(point, point, node.localToGlobalTransform());
            expect(point).toEqualVec4(vec4.fromValues(0, 0, -1, 1));
        });
    });

    describe('pointAt', () => {
        it('rotates a node about an axis', () => {
            const node = bone();
            node.createPoint('handle', { x: 1, y: 0.5, z: 0 });

            /*
             * Node's control points:
             *
             * X      <-- tip
             * |
             * |----X <-- handle
             * |
             * X      <-- base (at the origin)
             *
             */

            node
                .hold(node.point('base'))
                .hold(node.point('tip'))
                .grab(node.point('handle'))
                .pointAt({ x: 0, y: 0, z: 2 })
                .release();

            expect(node.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 0, -90, 0))
            );
        });

        it('rotates a node with two degrees of freedom', () => {
            const node = bone();
            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .pointAt({ x: 0, y: 0, z: 2 })
                .release();

            expect(node.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 90, 0, 0))
            );
        });

        it('can rotate a node to look at a global coordinate space point', () => {
            const parent = bone();
            const child = bone();
            child.point('base').stickTo(parent.point('tip'));

            parent
                .hold(parent.point('base'))
                .grab(parent.point('tip'))
                .pointAt({ x: 0, y: 0, z: -2 })
                .release();

            expect(parent.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), -90, 0, 0))
            );

            child
                .grab(child.point('tip'))
                .pointAt({ x: 0, y: 1, z: -1 })
                .release();

            expect(child.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 90, 0, 0))
            );
        });

        it('can rotate constrained to an axis a node to look at a point in another node', () => {
            const parent = bone();
            const child = bone();
            child.createPoint('handle', { x: 1, y: 0.5, z: 0 });
            child.point('base').stickTo(parent.point('tip'));

            const targetParent = bone();
            const target = bone();
            target.point('base').stickTo(targetParent.point('tip'));
            targetParent.setPosition({ x: 0, y: -1, z: -1 });

            parent
                .hold(parent.point('base'))
                .grab(parent.point('tip'))
                .pointAt({ x: 0, y: 0, z: -2 })
                .release();

            child
                .grab(child.point('tip'))
                .pointAt(target.point('tip'))
                .release();

            child
                .hold(child.point('tip'))
                .grab(child.point('handle'))
                .pointAt(target.point('tip'))
                .release();

            expect(child.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 90, 0, -90))
            );
        });

        it('can rotate a node to look at a point in another node', () => {
            const parent = bone();
            const child = bone();
            child.point('base').stickTo(parent.point('tip'));

            const target = bone();
            target.setPosition({ x: 0, y: 0, z: -1 });

            parent
                .hold(parent.point('base'))
                .grab(parent.point('tip'))
                .pointAt({ x: 0, y: 0, z: -2 })
                .release();

            child
                .grab(child.point('tip'))
                .pointAt(target.point('tip'))
                .release();

            expect(child.getRotation()).toEqualMat4(
                mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 90, 0, 0))
            );
        });

        it('can rotate a node to look at a point in another node while scaled', () => {
            const node = bone();
            node.setScale(mat4.fromScaling(mat4.create(), vec3.fromValues(1, 2, 1)));
            node.setPosition({ x: 4, y: 0, z: 0 });

            const target = bone();

            // The transformation should be stable, so the rotation should not change
            // when we call `pointAt` multiple times in a row
            for (let i = 0; i < 2; i += 1) {
                node
                    .hold(node.point('base'))
                    .grab(node.point('tip'))
                    .pointAt(target.point('tip'))
                    .release();

                expect(node.getRotation()).toEqualMat4(
                    mat4.fromQuat(
                        mat4.create(),
                        quat.fromEuler(quat.create(), 0, 0, Math.atan2(4, 1) / Math.PI * 180)
                    )
                );
            }
        });

        it("can rotate about a point that isn't the origin", () => {
            const node = bone();

            node
                .hold(node.point('tip'))
                .grab(node.point('base'))
                .pointAt({ x: 1, y: 1, z: 0 })
                .release();

            const tipPoint = vec4.fromValues(0, 1, 0, 1);
            vec4.transformMat4(tipPoint, tipPoint, node.localToGlobalTransform());
            expect(tipPoint).toEqualVec4(vec4.fromValues(0, 1, 0, 1));

            const basePoint = vec4.fromValues(0, 0, 0, 1);
            vec4.transformMat4(basePoint, basePoint, node.localToGlobalTransform());
            expect(basePoint).toEqualVec4(vec4.fromValues(1, 1, 0, 1));
        });
    });

    describe('stretchTo', () => {
        it('brings the grabbed point to the target when there are 2 degrees of freedom', () => {
            const node = bone();
            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .stretchTo({ x: 0, y: 0, z: 2 })
                .release();

            // Check that the tip of the bone ends up at the target
            const testPoint = vec4.fromValues(0, 1, 0, 1);
            vec4.transformMat4(testPoint, testPoint, node.localToGlobalTransform());
            expect(testPoint).toEqualVec4(vec4.fromValues(0, 0, 2, 1));
        });

        it('brings the grabbed point to the target when there are 2 degrees of freedom and an initial scale', () => {
            const node = bone();
            node.setScale(mat4.fromScaling(mat4.create(), vec3.fromValues(2, 3, 5)));

            node
                .hold(node.point('base'))
                .grab(node.point('tip'))
                .stretchTo({ x: 0, y: 0, z: 2 })
                .release();

            // Check that the tip of the bone ends up at the target
            const testPoint = vec4.fromValues(0, 1, 0, 1);
            vec4.transformMat4(testPoint, testPoint, node.localToGlobalTransform());
            expect(testPoint).toEqualVec4(vec4.fromValues(0, 0, 2, 1));
        });

        it('brings the grabbed point as close as it can to the target when there is 1 degree of freedom', () => {
            const node = bone();
            node.createPoint('handle', { x: 1, y: 0.5, z: 0 });

            node
                .hold(node.point('base'))
                .hold(node.point('tip'))
                .grab(node.point('handle'))
                .stretchTo({ x: 0, y: 0, z: 2 })
                .release();

            // Check that the handle of the bone ends up at the target
            const testPoint = vec4.fromValues(1, 0.5, 0, 1);
            vec4.transformMat4(testPoint, testPoint, node.localToGlobalTransform());
            expect(testPoint).toEqualVec4(vec4.fromValues(0, 0.5, 2, 1));
        });
    });

    describe('computeRenderInfo', () => {
        it("flattens the parent's coordinate space and returns an array of `RenderObject`s", () => {
            const geometry: WorkingGeometry = new WorkingGeometry({
                vertices: [vec3.create()],
                normals: [vec3.create()],
                faces: [new Face([], [])],
                controlPoints: [vec3.create()],
                material: defaultMaterial
            });
            const root = new Node();
            const nodeChild = new Node(root);
            const geometryChild = new GeometryNode(geometry, nodeChild);
            const model = Model.create(root, nodeChild, geometryChild);

            // Translate the root node 1 unit in the x-direction.
            root.setPosition({ x: 1, y: 0, z: 0 });

            // Rotate this child matrix 90 degrees about the x-axis.
            const rotation = mat4.fromQuat(mat4.create(), quat.fromEuler(quat.create(), 90, 0, 0));
            nodeChild.setRotation(rotation);

            /**
             * Here we're defining a test point and what we expect the result of
             * the transformation on that point should be, so that we can assert
             * that applying the returned transformation yields the expected
             * result.
             *
             * Because it does a translation, and then a rotation, we expect the
             * point that was at 0, 1, 0 should now be at 1, 0, 1.
             */
            const inputPoint = vec4.fromValues(0, 1, 0, 1);
            const expectedPoint = vec4.fromValues(1, 0, 1, 1);

            const renderObjects: RenderObject[] = model.computeRenderInfo(false).geometry;

            expect(renderObjects.length).toBe(1);

            const transformedPoint = vec4.create();
            vec4.transformMat4(transformedPoint, inputPoint, renderObjects[0].transform);
            expect(transformedPoint).toEqualVec4(expectedPoint);
        });

        it('defaults to no transformation', () => {
            const geometry: WorkingGeometry = new WorkingGeometry({
                vertices: [vec3.create()],
                normals: [vec3.create()],
                faces: [new Face([], [])],
                controlPoints: [vec3.create()],
                material: defaultMaterial
            });
            const root = new Node();
            const nodeChild = new Node(root);
            const geometryChild = new GeometryNode(geometry, nodeChild);
            const model = Model.create(root, nodeChild, geometryChild);

            /**
             * Here we're defining a test point and what we expect the result of
             * the transformation on that point should be, so that we can assert
             * that applying the returned transformation yields the expected
             * result.
             *
             * Because there are no transformations, we expect the point that
             * was at 0, 1, 0 should still be at 0, 1, 0.
             */
            const inputPoint = vec4.fromValues(0, 1, 0, 1);
            const expectedPoint = vec4.fromValues(0, 1, 0, 1);

            const renderObjects: RenderObject[] = model.computeRenderInfo(false).geometry;

            expect(renderObjects.length).toBe(1);

            const transformedPoint = vec4.create();
            vec4.transformMat4(transformedPoint, inputPoint, renderObjects[0].transform);
            expect(transformedPoint).toEqualVec4(expectedPoint);
        });

        it('shows bones when asked', () => {
            const root = bone();
            root.scale(2);

            // There should not be bones when there is only one node
            expect(Model.create(root).computeRenderInfo(true).bones.length).toBe(0);

            const child = bone();
            child.point('base').stickTo(root.point('tip'));

            // There should be a bone now that there is a child
            const bones = Model.create(root, child).computeRenderInfo(true).bones;
            expect(bones.length).toBe(1);

            // In its their own coordinate space, bones always have a length of 1, along
            // the x axis
            const boneSpaceBase = vec4.fromValues(0, 0, 0, 1);
            const boneSpaceTip = vec4.fromValues(1, 0, 0, 1);

            // Since the root is scaled, in world space, the bone should have a length of 2,
            // and should be oriented vertically
            const expectedWorldSpaceBase = vec4.fromValues(0, 0, 0, 1);
            const expectedWorldSpaceTip = vec4.fromValues(0, 2, 0, 1);

            // Check base and tip of the bone
            const transformedBase = vec4.create();
            vec4.transformMat4(transformedBase, boneSpaceBase, bones[0].transform);
            expect(transformedBase).toEqualVec4(expectedWorldSpaceBase);

            const transformedTip = vec4.create();
            vec4.transformMat4(transformedTip, boneSpaceTip, bones[0].transform);
            expect(transformedTip).toEqualVec4(expectedWorldSpaceTip);
        });
    });
});
