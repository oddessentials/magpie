import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.environ.get('MAGPIE_ART', os.path.join(HERE, '..'))
OUT = os.environ.get('MAGPIE_RASTER', os.path.join(ART, 'raster'))
SAMPLES = int(os.environ.get('SAMPLES', '384'))
UNIT = 512.0
R_PLATE = 508.0 / UNIT
R_BEZEL = 470.0 / UNIT
R_FACE = 353.0 / UNIT
R_BEAD = 360.0 / UNIT


def use_gpu(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == backend
            scene.cycles.device = 'GPU'
            return backend
    scene.cycles.device = 'CPU'
    return 'CPU'


def fresh(size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    print('DEVICE', use_gpu(scene))
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    world = bpy.data.worlds.new('sky')
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    bg = tree.nodes['Background']
    coord = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    remap = tree.nodes.new('ShaderNodeMapRange')
    remap.inputs['From Min'].default_value = -1.0
    remap.inputs['From Max'].default_value = 1.0
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    stops = [(0.0, (0.010, 0.012, 0.020)), (0.5, (0.090, 0.080, 0.075)), (0.78, (0.42, 0.36, 0.30)), (1.0, (0.85, 0.80, 0.72))]
    ramp.color_ramp.elements[0].position = stops[0][0]
    ramp.color_ramp.elements[0].color = (*stops[0][1], 1.0)
    ramp.color_ramp.elements[1].position = stops[-1][0]
    ramp.color_ramp.elements[1].color = (*stops[-1][1], 1.0)
    for pos, col in stops[1:-1]:
        ramp.color_ramp.elements.new(pos).color = (*col, 1.0)
    tree.links.new(coord.outputs['Generated'], split.inputs['Vector'])
    tree.links.new(split.outputs['Z'], remap.inputs['Value'])
    tree.links.new(remap.outputs['Result'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.3
    return scene


def principled(name, base, metallic, roughness, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.05
    return mat, bsdf


def node(tree, kind, **inputs):
    n = tree.nodes.new(kind)
    for key, value in inputs.items():
        n.inputs[key].default_value = value
    return n


def worn_metal(name, base, edge, cavity, roughness, hammer_scale, hammer_strength):
    mat, bsdf = principled(name, base, 1.0, roughness)
    tree = mat.node_tree
    coord = tree.nodes.new('ShaderNodeTexCoord')
    geo = tree.nodes.new('ShaderNodeNewGeometry')
    ao = node(tree, 'ShaderNodeAmbientOcclusion', Distance=0.03)
    voronoi = node(tree, 'ShaderNodeTexVoronoi', Scale=hammer_scale)
    voronoi.feature = 'SMOOTH_F1'
    noise = node(tree, 'ShaderNodeTexNoise', Scale=260.0, Detail=8.0, Roughness=0.62)
    edge_ramp = tree.nodes.new('ShaderNodeValToRGB')
    edge_ramp.color_ramp.elements[0].position = 0.5
    edge_ramp.color_ramp.elements[1].position = 0.56
    colour = tree.nodes.new('ShaderNodeMix')
    colour.data_type = 'RGBA'
    colour.inputs['A'].default_value = (*base, 1.0)
    colour.inputs['B'].default_value = (*edge, 1.0)
    dark = tree.nodes.new('ShaderNodeMix')
    dark.data_type = 'RGBA'
    dark.inputs['B'].default_value = (*base, 1.0)
    dark.inputs['A'].default_value = (*cavity, 1.0)
    rough = node(tree, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': roughness - 0.08, 'To Max': roughness + 0.14})
    bump_small = node(tree, 'ShaderNodeBump', Strength=0.05, Distance=0.002)
    bump = node(tree, 'ShaderNodeBump', Strength=hammer_strength, Distance=0.004)
    tree.links.new(coord.outputs['Object'], voronoi.inputs['Vector'])
    tree.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    tree.links.new(geo.outputs['Pointiness'], edge_ramp.inputs['Fac'])
    tree.links.new(edge_ramp.outputs['Color'], colour.inputs['Factor'])
    tree.links.new(ao.outputs['AO'], dark.inputs['Factor'])
    tree.links.new(colour.outputs['Result'], dark.inputs['B'])
    tree.links.new(dark.outputs['Result'], bsdf.inputs['Base Color'])
    tree.links.new(noise.outputs['Fac'], rough.inputs['Value'])
    tree.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    tree.links.new(noise.outputs['Fac'], bump_small.inputs['Height'])
    tree.links.new(voronoi.outputs['Distance'], bump.inputs['Height'])
    tree.links.new(bump_small.outputs['Normal'], bump.inputs['Normal'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def stone(name, base, light, roughness, scale):
    mat, bsdf = principled(name, base, 0.0, roughness)
    tree = mat.node_tree
    coord = tree.nodes.new('ShaderNodeTexCoord')
    grain = node(tree, 'ShaderNodeTexNoise', Scale=scale, Detail=12.0, Roughness=0.7)
    cloud = node(tree, 'ShaderNodeTexNoise', Scale=scale / 40.0, Detail=4.0, Roughness=0.5)
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*base, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    bump = node(tree, 'ShaderNodeBump', Strength=0.12, Distance=0.002)
    tree.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    tree.links.new(coord.outputs['Object'], cloud.inputs['Vector'])
    tree.links.new(cloud.outputs['Fac'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    tree.links.new(grain.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def plume():
    mat, bsdf = principled('plume', (0.012, 0.014, 0.018), 1.0, 0.28)
    tree = mat.node_tree
    bsdf.inputs['Thin Film Thickness'].default_value = 420.0
    bsdf.inputs['Thin Film IOR'].default_value = 1.45
    uv = tree.nodes.new('ShaderNodeUVMap')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    across = node(tree, 'ShaderNodeMath')
    across.operation = 'ABSOLUTE'
    along = node(tree, 'ShaderNodeMath')
    along.operation = 'MULTIPLY'
    along.inputs[1].default_value = 70.0
    slant = node(tree, 'ShaderNodeMath')
    slant.operation = 'MULTIPLY'
    slant.inputs[1].default_value = 9.0
    phase = node(tree, 'ShaderNodeMath')
    phase.operation = 'SUBTRACT'
    wave = node(tree, 'ShaderNodeMath')
    wave.operation = 'SINE'
    bump = node(tree, 'ShaderNodeBump', Strength=0.35, Distance=0.002)
    film = node(tree, 'ShaderNodeTexNoise', Scale=6.0, Detail=2.0)
    thickness = node(tree, 'ShaderNodeMapRange', **{'From Min': 0.3, 'From Max': 0.7, 'To Min': 385.0, 'To Max': 470.0})
    coord = tree.nodes.new('ShaderNodeTexCoord')
    tree.links.new(uv.outputs['UV'], split.inputs['Vector'])
    tree.links.new(split.outputs['Y'], across.inputs[0])
    tree.links.new(split.outputs['X'], along.inputs[0])
    tree.links.new(across.outputs['Value'], slant.inputs[0])
    tree.links.new(along.outputs['Value'], phase.inputs[0])
    tree.links.new(slant.outputs['Value'], phase.inputs[1])
    tree.links.new(phase.outputs['Value'], wave.inputs[0])
    tree.links.new(wave.outputs['Value'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    tree.links.new(coord.outputs['Object'], film.inputs['Vector'])
    tree.links.new(film.outputs['Fac'], thickness.inputs['Value'])
    tree.links.new(thickness.outputs['Result'], bsdf.inputs['Thin Film Thickness'])
    return mat


def materials():
    return {
        'bronze': worn_metal('bronze', (0.13, 0.068, 0.028), (0.50, 0.32, 0.15), (0.03, 0.015, 0.007), 0.36, 90.0, 0.22),
        'gold': worn_metal('gold', (0.78, 0.50, 0.14), (1.0, 0.86, 0.52), (0.26, 0.15, 0.04), 0.2, 160.0, 0.08),
        'slate': stone('slate', (0.020, 0.026, 0.038), (0.050, 0.060, 0.078), 0.5, 180.0),
        'face': stone('face', (0.008, 0.010, 0.018), (0.020, 0.024, 0.036), 0.72, 220.0),
        'teal': principled('teal', (0.006, 0.20, 0.155), 0.0, 0.12, coat=1.0)[0],
        'plume': plume(),
        'ink': principled('ink', (0.006, 0.008, 0.014), 0.0, 0.3, coat=1.0)[0],
        'silver': worn_metal('silver', (0.62, 0.66, 0.72), (0.95, 0.97, 1.0), (0.16, 0.18, 0.22), 0.24, 130.0, 0.1)
    }


def link(obj, mat):
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def annulus(name, r_in, r_out, z, thickness, mat, bevel=0.006, segments=384, a0=0.0, a1=360.0):
    closed = abs(a1 - a0) >= 360.0
    verts, faces = [], []
    steps = segments if closed else segments + 1
    for i in range(steps):
        t = math.radians(a0 + (a1 - a0) * i / segments)
        verts.append((-r_in * math.sin(t), -r_in * math.cos(t), z))
        verts.append((-r_out * math.sin(t), -r_out * math.cos(t), z))
    for i in range(segments):
        a, b = 2 * i, 2 * i + 1
        j = (i + 1) % steps if closed else i + 1
        faces.append((a, 2 * j, 2 * j + 1, b))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    solid = obj.modifiers.new('solid', 'SOLIDIFY')
    solid.thickness = thickness
    solid.offset = -1.0
    bev = obj.modifiers.new('bevel', 'BEVEL')
    bev.width = bevel
    bev.segments = 5
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(35)
    link(obj, mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def disc(name, radius, z, thickness, mat, segments=384):
    return annulus(name, 0.0005, radius, z, thickness, mat, bevel=0.004, segments=segments)


def polar(r, degrees):
    t = math.radians(degrees)
    return Vector((-r * math.sin(t), -r * math.cos(t), 0.0))


def stud(name, r, degrees, radius, z, mat, squash=0.55):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=radius, location=polar(r, degrees) + Vector((0, 0, z)))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (1.0, 1.0, squash)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def diamond(name, r, degrees, length, width, z, height, mat):
    centre = polar(r, degrees)
    radial = polar(1.0, degrees)
    across = Vector((radial.y, -radial.x, 0.0))
    tip_out = centre + radial * (length / 2)
    tip_in = centre - radial * (length / 2)
    side_a = centre + across * (width / 2)
    side_b = centre - across * (width / 2)
    top = centre + Vector((0, 0, height))
    base = [tip_out, side_a, tip_in, side_b]
    verts = [tuple(v + Vector((0, 0, z))) for v in base] + [tuple(top + Vector((0, 0, z)))]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bev = obj.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.0035
    bev.segments = 3
    return link(obj, mat)


def poly_curve(name, points, depth, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = depth
    data.bevel_resolution = 4
    data.use_fill_caps = True
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, v in zip(spline.points, points):
        p.co = (v.x, v.y, v.z, 1.0)
    obj = bpy.data.objects.new(name, data)
    return link(obj, mat)


def feather(name, r, centre_degrees, span_degrees, z, mats, width=0.044):
    steps = 64
    rows = []
    for i in range(steps + 1):
        s = i / steps
        degrees = centre_degrees - span_degrees / 2 + span_degrees * s
        bow = 0.012 * math.sin(math.pi * s)
        profile = 0.0 if s < 0.08 else min(1.0, 1.6 * math.sin(math.pi * (s - 0.08) / 0.92) ** 0.8) * (1.0 - 0.35 * s)
        up = width * profile
        down = width * 0.5 * profile
        rows.append((s, degrees, r + bow, up, down))
    verts, faces, uvs = [], [], []
    for s, degrees, rr, up, down in rows:
        for offset, v in ((-down, -1.0 if down else 0.0), (0.0, 0.0), (up, 1.0 if up else 0.0)):
            verts.append(tuple(polar(rr + offset, degrees) + Vector((0, 0, z))))
            uvs.append((s, v))
    for i in range(steps):
        for k in range(2):
            a = i * 3 + k
            faces.append((a, a + 1, a + 4, a + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    solid = obj.modifiers.new('solid', 'SOLIDIFY')
    solid.thickness = 0.007
    solid.offset = 1.0
    bev = obj.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.002
    bev.segments = 3
    link(obj, mats['plume'])
    for poly in obj.data.polygons:
        poly.use_smooth = True
    shaft = [polar(rr, degrees) + Vector((0, 0, z + 0.0075)) for s, degrees, rr, up, down in rows[:-3]]
    poly_curve(name + '_shaft', shaft, 0.0038, mats['gold'])


def import_mark(scale_to, at, z, mats):
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=os.path.join(ART, 'mark.svg'))
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
    parts.sort(key=lambda o: o.name)
    for o in parts:
        for col in list(o.users_collection):
            col.objects.unlink(o)
        bpy.context.scene.collection.objects.link(o)
    roles = ['gold', 'gold', 'gold', 'gold', 'silver', 'ink', 'gold']
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(c) for o in parts for c in o.bound_box]
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    k = scale_to / span
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    for index, o in enumerate(parts):
        o.data.dimensions = '2D'
        role = roles[index] if index < len(roles) else 'gold'
        o.data.extrude = 0.0028 if role == 'gold' else 0.0016
        o.data.bevel_depth = 0.0012 if role == 'gold' else 0.0
        o.data.materials.clear()
        o.data.materials.append(mats[role])
        o.scale = (k, k, 1.0)
        o.location = ((o.location.x - cx) * k + at.x, (o.location.y - cy) * k + at.y, z + (0.004 if role != 'gold' else 0.0))
    return parts


def lights(key=320.0, fill=90.0, rim=140.0):
    def area(name, loc, rot, size, energy, colour):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = size
        light.color = colour
        obj = bpy.data.objects.new(name, light)
        obj.location = loc
        obj.rotation_euler = rot
        obj.visible_camera = False
        bpy.context.collection.objects.link(obj)
    area('key', (-2.2, 2.6, 3.4), (math.radians(40), math.radians(-24), math.radians(20)), 2.2, key, (1.0, 0.92, 0.80))
    area('fill', (2.6, 0.6, 2.4), (math.radians(20), math.radians(46), 0.0), 3.0, fill, (0.80, 0.90, 1.0))
    area('rim', (1.2, -2.8, 1.4), (math.radians(-62), math.radians(14), 0.0), 2.6, rim, (1.0, 0.86, 0.70))
    area('sky', (0.0, 0.0, 4.5), (0.0, 0.0, 0.0), 6.0, key * 0.11, (0.92, 0.96, 1.0))


def camera(scale):
    data = bpy.data.cameras.new('cam')
    data.type = 'ORTHO'
    data.ortho_scale = scale
    cam = bpy.data.objects.new('cam', data)
    cam.location = (0, 0, 6)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def render(scene, name):
    os.makedirs(OUT, exist_ok=True)
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)


def plate():
    scene = fresh(1024)
    m = materials()
    annulus('bezel', R_BEZEL, R_PLATE, 0.070, 0.070, m['bronze'], bevel=0.012)
    annulus('bezel_lip', R_BEZEL - 0.006, R_BEZEL + 0.012, 0.078, 0.012, m['gold'], bevel=0.004)
    annulus('ring', R_FACE, R_BEZEL, 0.052, 0.050, m['slate'], bevel=0.008)
    annulus('ring_inlay_out', R_BEZEL - 0.034, R_BEZEL - 0.028, 0.055, 0.006, m['gold'], bevel=0.0015)
    annulus('ring_inlay_in', R_BEAD + 0.030, R_BEAD + 0.036, 0.055, 0.006, m['gold'], bevel=0.0015)
    disc('face', R_FACE, 0.018, 0.018, m['face'])
    annulus('face_lip', R_FACE - 0.006, R_FACE + 0.006, 0.032, 0.014, m['teal'], bevel=0.004)
    for i in range(96):
        stud('bead_%d' % i, R_BEAD + 0.014, i * 360.0 / 96, 0.0078, 0.056, m['gold'], squash=0.7)
    for hour in range(24):
        stud('hour_%d' % hour, (R_BEZEL + R_PLATE) / 2, hour * 15.0, 0.0125, 0.070, m['gold'], squash=0.6)
    for k in range(8):
        degrees = k * 45.0
        if degrees == 180.0:
            continue
        diamond('diamond_%d' % k, (R_BEAD + R_BEZEL) / 2, degrees, 0.105, 0.046, 0.052, 0.024, m['gold'])
    for k in range(8):
        centre = 22.5 + k * 45.0
        if abs(centre - 180.0) < 30.0:
            continue
        feather('feather_%d' % k, (R_BEAD + R_BEZEL) / 2 - 0.004, centre, 36.0, 0.052, m)
    for side in (-1, 1):
        feather('feather_crest_%d' % side, (R_BEAD + R_BEZEL) / 2 - 0.004, 180.0 + side * 36.5, 13.0, 0.052, m, width=0.03)
    crest_in = R_BEAD + 0.030
    annulus('crest', crest_in, R_PLATE - 0.006, 0.090, 0.040, m['bronze'], bevel=0.010, segments=96, a0=180.0 - 26.0, a1=180.0 + 26.0)
    annulus('crest_rim', crest_in + 0.010, R_PLATE - 0.018, 0.093, 0.004, m['gold'], bevel=0.002, segments=96, a0=180.0 - 23.5, a1=180.0 + 23.5)
    annulus('crest_field', crest_in + 0.016, R_PLATE - 0.024, 0.095, 0.004, m['teal'], bevel=0.002, segments=96, a0=180.0 - 22.5, a1=180.0 + 22.5)
    at = polar((crest_in + R_PLATE) / 2 - 0.004, 180.0)
    import_mark(0.19, at + Vector((0.0, -0.006, 0.0)), 0.097, m)
    lights()
    camera(2.0)
    render(scene, 'dial-plate-render.png')


def sun():
    scene = fresh(384)
    m = materials()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=0.40, location=(0, 0, 0))
    core = bpy.context.object
    core.scale = (1.0, 1.0, 0.32)
    core.data.materials.append(m['gold'])
    bpy.ops.object.shade_smooth()
    annulus('sun_band', 0.40, 0.47, 0.060, 0.040, m['bronze'], bevel=0.010, segments=192)
    for i in range(16):
        long_ray = i % 2 == 0
        length = 0.46 if long_ray else 0.30
        width = 0.15 if long_ray else 0.11
        r = 0.47 + length / 2 - 0.02
        diamond('ray_%d' % i, r, i * 22.5, length, width, 0.020, 0.050 if long_ray else 0.038, m['gold'])
    star = [polar(0.16 if j % 2 == 0 else 0.05, j * 45.0) + Vector((0, 0, 0.14)) for j in range(9)]
    poly_curve('sun_star', star, 0.012, m['teal'])
    lights(key=700.0, fill=200.0, rim=260.0)
    camera(2.1)
    render(scene, 'sun-render.png')


def crescent_outline(r1, centre, r2, steps=160):
    d = centre.length
    a = (d * d + r1 * r1 - r2 * r2) / (2 * d)
    h = math.sqrt(max(0.0, r1 * r1 - a * a))
    axis = centre / d
    normal = Vector((-axis.y, axis.x, 0.0))
    p1 = axis * a + normal * h
    p2 = axis * a - normal * h
    def angle(v, origin):
        return math.atan2(v.y - origin.y, v.x - origin.x)
    outer = []
    a1, a2 = angle(p1, Vector((0, 0, 0))), angle(p2, Vector((0, 0, 0)))
    if a2 < a1:
        a2 += 2 * math.pi
    for i in range(steps + 1):
        t = a1 + (a2 - a1) * i / steps
        outer.append(Vector((r1 * math.cos(t), r1 * math.sin(t), 0.0)))
    inner = []
    b1, b2 = angle(p2, centre), angle(p1, centre)
    if b1 < b2:
        b1 += 2 * math.pi
    for i in range(1, steps):
        t = b1 + (b2 - b1) * i / steps
        inner.append(centre + Vector((r2 * math.cos(t), r2 * math.sin(t), 0.0)))
    return outer + inner


def filled(name, outline, extrude, bevel, mat, z=0.0):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '2D'
    data.fill_mode = 'BOTH'
    data.extrude = extrude
    data.bevel_depth = bevel
    data.bevel_resolution = 8
    spline = data.splines.new('POLY')
    spline.points.add(len(outline) - 1)
    for p, v in zip(spline.points, outline):
        p.co = (v.x, v.y, 0.0, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, data)
    obj.location.z = z
    return link(obj, mat)


def cratered_silver():
    mat, bsdf = principled('moonstone', (0.70, 0.74, 0.80), 1.0, 0.3)
    tree = mat.node_tree
    coord = tree.nodes.new('ShaderNodeTexCoord')
    craters = node(tree, 'ShaderNodeTexVoronoi', Scale=7.0)
    craters.feature = 'F1'
    shape = node(tree, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 0.35, 'To Min': 0.0, 'To Max': 1.0})
    grain = node(tree, 'ShaderNodeTexNoise', Scale=90.0, Detail=10.0, Roughness=0.6)
    bump_c = node(tree, 'ShaderNodeBump', Strength=0.45, Distance=0.01)
    bump_g = node(tree, 'ShaderNodeBump', Strength=0.12, Distance=0.002)
    tone = tree.nodes.new('ShaderNodeValToRGB')
    tone.color_ramp.elements[0].position = 0.2
    tone.color_ramp.elements[0].color = (0.34, 0.38, 0.46, 1.0)
    tone.color_ramp.elements[1].position = 0.9
    tone.color_ramp.elements[1].color = (0.78, 0.82, 0.88, 1.0)
    tree.links.new(coord.outputs['Object'], craters.inputs['Vector'])
    tree.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    tree.links.new(craters.outputs['Distance'], shape.inputs['Value'])
    tree.links.new(shape.outputs['Result'], bump_c.inputs['Height'])
    tree.links.new(shape.outputs['Result'], tone.inputs['Fac'])
    tree.links.new(tone.outputs['Color'], bsdf.inputs['Base Color'])
    tree.links.new(grain.outputs['Fac'], bump_g.inputs['Height'])
    tree.links.new(bump_g.outputs['Normal'], bump_c.inputs['Normal'])
    tree.links.new(bump_c.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def moon():
    scene = fresh(384)
    m = materials()
    centre = Vector((0.42, 0.30, 0.0))
    outline = crescent_outline(0.80, centre, 0.68)
    filled('moon_body', outline, 0.05, 0.06, cratered_silver())
    rim = crescent_outline(0.80 - 0.035, centre, 0.68 + 0.035)
    rim = [v + Vector((0, 0, 0.115)) for v in rim]
    data = bpy.data.curves.new('moon_rim', 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = 0.016
    data.bevel_resolution = 4
    spline = data.splines.new('POLY')
    spline.points.add(len(rim) - 1)
    for p, v in zip(spline.points, rim):
        p.co = (v.x, v.y, v.z, 1.0)
    spline.use_cyclic_u = True
    link(bpy.data.objects.new('moon_rim', data), m['gold'])
    star_centre = centre * 0.62 + Vector((0.08, 0.06, 0.0))
    star = [polar(0.13 if j % 2 == 0 else 0.04, j * 45.0) + star_centre for j in range(8)]
    filled('moon_star', star, 0.02, 0.008, m['gold'], z=0.03)
    lights(key=650.0, fill=260.0, rim=240.0)
    camera(2.0)
    render(scene, 'moon-render.png')


wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['plate', 'sun', 'moon']
for job in wanted:
    {'plate': plate, 'sun': sun, 'moon': moon}[job]()
