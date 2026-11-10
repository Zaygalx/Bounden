#!/usr/bin/env python3
"""Build + animate the Bounden cashier — FULL FILM pass (pass 2).

Derived from figure3d_build.py (the proof reel): same character,
same rig, same render route; the choreography covers the whole
Script v5 film timeline and renders to seq-film/.

Original header follows:
Build + animate the Bounden cashier as a rigged 3D character.

Rework pass 1c (owner's direction, 10 Nov 2026): the 2.5D warp rig
is retired. The presenter is now a real articulated character built
in Blender from the owner's reference — a figure in a flowing red
hooded cloak with a gold face wrap, no visible face. Articulated
armature (arms that swing, raise, point; head that turns, nods and
shakes; legs under the cloak for a walk cycle), bone-driven cloak
with lagged hem bones so the cloth keeps moving after he stops.

Run:
  blender -b --python figure3d_build.py -- stills WORKBENCH
  blender -b --python figure3d_build.py -- anim   WORKBENCH
  blender -b --python figure3d_build.py -- blend

Poses are computed analytically per frame from semantic controls
("raise the right arm forward 60 degrees") and converted into bone
space by conjugation with each bone's rest orientation, so the
choreography below reads in plain stage directions.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

# ------------------------------------------------------------------
# constants: stage, timing, canvas

FILM = "/home/hatch/workspace/bounden/film"
SHOOT = os.path.join(FILM, "shoot")
SCRATCH = "/home/hatch/scratch-fig3d"
SEQ_DIR = os.path.join(SCRATCH, "seq-film")
STILL_DIR = os.path.join(SCRATCH, "stills-film")
BLEND_OUT = os.path.join(SHOOT, "figure3d-film.blend")

FPS = 24
TOTAL = 81.6                       # seconds; the story's full length (pass 2)
N_FRAMES = int(TOTAL * FPS) + 1

CANVAS_W, CANVAS_H = 1200, 982     # rendered layer (~1.8x of 660x540)
CAM_X = -0.79
CAM_Y = -4.45
CAM_Z = 0.92
CAM_SHIFT_Y = 0.20

WALK_END = 2.9
VOICE = {  # reel-time windows (hook starts 0.90, choice at 11.36)
    "S1": (0.90, 2.69), "S2": (2.91, 5.43), "S3": (5.65, 10.96),
    "C1": (11.36, 13.79), "C2": (14.28, 15.33), "C3": (15.86, 19.71),
    "C4": (20.12, 20.96), "C5": (21.56, 22.37),
}
SHAKE = (8.35, 10.75)              # across "run away with his money"

# ------------------------------------------------------------------
# small helpers


def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * u * (u * (u * 6 - 15) + 10)


def pulse(t, a, b, feather=0.35):
    """0 before a, 1 between, 0 after b — smooth in/out over the
    feather on both sides of the window."""
    if t <= a - feather or t >= b + feather:
        return 0.0
    if t < a + feather:
        return smooth((t - (a - feather)) / (2 * feather))
    if t > b - feather:
        return 1.0 - smooth((t - (b - feather)) / (2 * feather))
    return 1.0


def ramp(t, a, b):
    return smooth((t - a) / (b - a))


def mat(name, rgb, rough=0.75, metallic=0.0, sheen=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if sheen:
        try:
            bsdf.inputs["Sheen Weight"].default_value = sheen
            bsdf.inputs["Sheen Color"].default_value = (1.0, 0.55, 0.4, 1.0)
            bsdf.inputs["Sheen Roughness"].default_value = 0.55
        except KeyError:
            pass
    return m


RED = (0.36, 0.018, 0.028)
RED_DARK = (0.20, 0.010, 0.016)
GOLD = (0.55, 0.36, 0.06)
GOLD_DARK = (0.40, 0.25, 0.04)
SKIN = (0.16, 0.09, 0.055)
SHADOW_FACE = (0.030, 0.020, 0.014)
CLOTH_DARK = (0.05, 0.04, 0.035)


def lathe(profile, segments=56, cx=0.0, cy=0.0, yscale=1.0,
          fold_amp=0.0, fold_n=7, fold_twist=0.5, theta0=0.0,
          theta1=2 * math.pi, ridge=None):
    """Surface of revolution from [(z, r), ...] (bottom first).

    Returns (verts, faces). Optional cloth folds: radial sine whose
    amplitude is scaled per-ring by fold_amp * (ring fraction).
    theta range allows partial shells (hood, wrap).
    """
    verts, faces = [], []
    rings = len(profile)
    full = abs((theta1 - theta0) - 2 * math.pi) < 1e-6
    cols = segments if full else segments + 1
    for i, (z, r) in enumerate(profile):
        frac = i / (rings - 1)
        for j in range(cols):
            th = theta0 + (theta1 - theta0) * (j / segments)
            rr = r
            if fold_amp:
                rr += fold_amp * frac * math.sin(
                    fold_n * th + fold_twist * frac * 2.2)
                rr += 0.35 * fold_amp * frac * math.sin(3 * th + 1.0)
                rr += 0.30 * fold_amp * frac * math.sin(
                    13 * th + 2.0 * frac + 0.7)
            if ridge:
                rr += ridge(z, th)
            verts.append((cx + rr * math.cos(th),
                          cy + rr * math.sin(th) * yscale, z))
    for i in range(rings - 1):
        for j in range(segments):
            j1 = (j + 1) % cols if full else j + 1
            if not full and j == segments - 1:
                break
            a = i * cols + j
            b = i * cols + j1
            c = (i + 1) * cols + j1
            d = (i + 1) * cols + j
            faces.append((a, b, c, d))
    return verts, faces


def mesh_from(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    if material:
        me.materials.append(material)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def sphere(name, loc, scale, material, seg=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=seg, ring_count=rings, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.shade_smooth()
    if material:
        ob.data.materials.append(material)
    # bake the object transform into the vertices, so every part is
    # authored in armature space and can be skinned uniformly
    ob.data.transform(ob.matrix_basis)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)
    return ob


def capsule(name, p0, p1, r0, r1, material):
    """Tapered tube between two points with ball caps (lathe along
    the segment, built in world space)."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0)
    length = axis.length
    axis.normalize()
    prof = [(0.0, r0 * 0.25), (r0 * 0.55, r0 * 0.8), (r0, r0),
            (length - r1, r1), (length - r1 * 0.45, r1 * 0.82),
            (length, r1 * 0.25)]
    verts, faces = lathe(prof, segments=24)
    # orient local +Z onto the segment
    q = Vector((0, 0, 1)).rotation_difference(axis)
    out = []
    for v in verts:
        w = q @ Vector(v) + p0
        out.append(tuple(w))
    return mesh_from(name, out, faces, material)


# ------------------------------------------------------------------
# the character

CLOAK_PROFILE = [  # (z, r) bottom -> shoulder
    (0.14, 0.520), (0.30, 0.495), (0.50, 0.460), (0.70, 0.425),
    (0.90, 0.385), (1.05, 0.345), (1.20, 0.318), (1.32, 0.302),
    (1.42, 0.292), (1.50, 0.235), (1.545, 0.150),
]
HOOD_PROFILE = [
    (1.44, 0.238), (1.52, 0.208), (1.60, 0.178), (1.68, 0.166),
    (1.76, 0.140), (1.82, 0.075), (1.85, 0.012),
]
FRONT = -math.pi / 2  # character faces -Y


def cloak_r(z):
    for (z0, r0), (z1, r1) in zip(CLOAK_PROFILE, CLOAK_PROFILE[1:]):
        if z0 <= z <= z1:
            u = (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * u
    return CLOAK_PROFILE[-1][1]


def build_character():
    m_red = mat("CloakRed", RED, rough=0.62, sheen=0.5)
    m_red_d = mat("CloakDark", RED_DARK, rough=0.7, sheen=0.3)
    m_gold = mat("WrapGold", GOLD, rough=0.82)
    m_gold_d = mat("WrapGoldDark", GOLD_DARK, rough=0.85)
    m_skin = mat("Skin", SKIN, rough=0.6)
    m_face = mat("FaceShadow", SHADOW_FACE, rough=0.95)
    m_dark = mat("ClothDark", CLOTH_DARK, rough=0.9)

    parts = {}  # name -> (object, bone or None for skinned cloak)

    # -- cloak (skinned later) --
    verts, faces = lathe(CLOAK_PROFILE, segments=64, yscale=0.86,
                         fold_amp=0.042, fold_n=7, fold_twist=0.6)
    # hem waviness
    verts = [(x, y, z + (0.010 * math.sin(9 * math.atan2(y / 0.86, x))
                         if z < 0.2 else 0.0)) for (x, y, z) in verts]
    cloak = mesh_from("Cloak", verts, faces, m_red)
    parts["cloak"] = (cloak, None)

    # -- hood: partial shell leaving the face opening --
    opening = math.radians(58)
    verts, faces = lathe(HOOD_PROFILE, segments=48, yscale=0.95,
                         fold_amp=0.006, fold_n=5,
                         theta0=FRONT + opening,
                         theta1=FRONT + 2 * math.pi - opening)
    hood = mesh_from("Hood", verts, faces, m_red)
    parts["hood"] = (hood, "head")
    # hood point above the brow
    peak = capsule("HoodPeak", (0, -0.045, 1.800), (0, -0.165, 1.845),
                   0.042, 0.006, m_red)
    parts["peak"] = (peak, "head")

    # -- head: shadowed face, never seen --
    head = sphere("Head", (0, -0.012, 1.665), (0.108, 0.118, 0.118),
                  m_face)
    parts["head"] = (head, "head")
    # faint eyes in the shadow
    for s in (-1, 1):
        eye = sphere(f"Eye{s}", (s * 0.042, -0.118, 1.688),
                     (0.013, 0.006, 0.008), m_skin, seg=12, rings=8)
        parts[f"eye{s}"] = (eye, "head")

    # -- gold wrap: band around the lower face + hanging tail --
    def wrap_ridge(z, th):
        return 0.0035 * math.sin(2 * math.pi * (z - 1.545) / 0.030)
    verts, faces = lathe([(1.540, 0.118), (1.575, 0.126),
                          (1.610, 0.127), (1.645, 0.120)],
                         segments=40, yscale=0.98, ridge=wrap_ridge,
                         theta0=FRONT - math.radians(102),
                         theta1=FRONT + math.radians(102))
    # shift the band slightly forward on the face
    verts = [(x, y - 0.012, z) for (x, y, z) in verts]
    wrap = mesh_from("Wrap", verts, faces, m_gold)
    parts["wrap"] = (wrap, "head")
    tail_prof = []
    for z in (1.575, 1.48, 1.38, 1.30, 1.245):
        tail_prof.append((z, cloak_r(z) + 0.010))
    verts, faces = lathe(tail_prof, segments=16, yscale=0.86,
                         ridge=lambda z, th: 0.004 * math.sin(
                             2 * math.pi * (1.575 - z) / 0.055),
                         theta0=FRONT - math.radians(30),
                         theta1=FRONT + math.radians(30))
    tail = mesh_from("WrapTail", verts, faces, m_gold_d)
    parts["tail"] = (tail, "chest")

    # -- neck / torso filler --
    neck = capsule("Neck", (0, 0, 1.47), (0, -0.005, 1.60), 0.055,
                   0.05, m_dark)
    parts["neck"] = (neck, "neck")

    # -- arms: red sleeves, rigid segments on bones --
    for side, sx in (("L", -1), ("R", 1)):
        sh = (sx * 0.240, 0.0, 1.460)
        el = (sx * 0.258, -0.002, 1.168)
        wr = (sx * 0.268, -0.006, 0.888)
        up = capsule(f"UpperArm{side}", sh, el, 0.088, 0.080, m_red)
        parts[f"up{side}"] = (up, f"upperarm.{side}")
        fo = capsule(f"Forearm{side}", el, wr, 0.084, 0.134, m_red)
        parts[f"fo{side}"] = (fo, f"forearm.{side}")
        cap = sphere(f"WristCap{side}", wr, (0.126, 0.116, 0.014),
                     m_red_d)
        parts[f"wc{side}"] = (cap, f"forearm.{side}")
        palm = sphere(f"Palm{side}", (sx * 0.270, -0.010, 0.830),
                      (0.044, 0.022, 0.056), m_skin)
        parts[f"palm{side}"] = (palm, f"hand.{side}")
        fin = capsule(f"Fingers{side}", (sx * 0.270, -0.012, 0.808),
                      (sx * 0.270, -0.020, 0.700), 0.0185, 0.013,
                      m_skin)
        parts[f"fin{side}"] = (fin, f"hand.{side}")
        th = sphere(f"Thumb{side}", (sx * 0.238, -0.026, 0.815),
                    (0.011, 0.014, 0.020), m_skin, seg=12, rings=8)
        parts[f"th{side}"] = (th, f"hand.{side}")
        # shoulder drape cap, rides the chest
        dr = sphere(f"Drape{side}", (sx * 0.205, 0.0, 1.472),
                    (0.115, 0.100, 0.075), m_red)
        parts[f"dr{side}"] = (dr, "chest")

    # -- legs under the cloak (walk) --
    for side, sx in (("L", -1), ("R", 1)):
        hip = (sx * 0.105, 0.0, 0.985)
        knee = (sx * 0.112, -0.004, 0.545)
        ank = (sx * 0.112, -0.002, 0.115)
        th = capsule(f"Thigh{side}", hip, knee, 0.078, 0.062, m_dark)
        parts[f"thigh{side}"] = (th, f"thigh.{side}")
        sn = capsule(f"Shin{side}", knee, ank, 0.060, 0.045, m_dark)
        parts[f"shin{side}"] = (sn, f"shin.{side}")
        shoe = sphere(f"Shoe{side}", (sx * 0.112, -0.045, 0.052),
                      (0.052, 0.105, 0.034), m_dark)
        parts[f"shoe{side}"] = (shoe, f"foot.{side}")

    return parts


# bone table: name, head, tail, parent
BONES = [
    ("hips", (0, 0, 0.99), (0, 0, 1.12), None),
    ("spine", (0, 0, 1.12), (0, 0, 1.30), "hips"),
    ("chest", (0, 0, 1.30), (0, 0, 1.47), "spine"),
    ("neck", (0, 0, 1.47), (0, 0, 1.575), "chest"),
    ("head", (0, 0, 1.575), (0, 0, 1.79), "neck"),
    ("shoulder.L", (-0.085, 0, 1.455), (-0.235, 0, 1.452), "chest"),
    ("shoulder.R", (0.085, 0, 1.455), (0.235, 0, 1.452), "chest"),
    ("upperarm.L", (-0.240, 0, 1.460), (-0.258, -0.002, 1.168),
     "shoulder.L"),
    ("upperarm.R", (0.240, 0, 1.460), (0.258, -0.002, 1.168),
     "shoulder.R"),
    ("forearm.L", (-0.258, -0.002, 1.168), (-0.268, -0.006, 0.888),
     "upperarm.L"),
    ("forearm.R", (0.258, -0.002, 1.168), (0.268, -0.006, 0.888),
     "upperarm.R"),
    ("hand.L", (-0.268, -0.006, 0.888), (-0.270, -0.012, 0.760),
     "forearm.L"),
    ("hand.R", (0.268, -0.006, 0.888), (0.270, -0.012, 0.760),
     "forearm.R"),
    ("thigh.L", (-0.105, 0, 0.985), (-0.112, -0.004, 0.545), "hips"),
    ("thigh.R", (0.105, 0, 0.985), (0.112, -0.004, 0.545), "hips"),
    ("shin.L", (-0.112, -0.004, 0.545), (-0.112, -0.002, 0.115),
     "thigh.L"),
    ("shin.R", (0.112, -0.004, 0.545), (0.112, -0.002, 0.115),
     "thigh.R"),
    ("foot.L", (-0.112, -0.002, 0.115), (-0.112, -0.10, 0.045),
     "shin.L"),
    ("foot.R", (0.112, -0.002, 0.115), (0.112, -0.10, 0.045),
     "shin.R"),
]
# cloak hem bones: children of spine, fanning to the hem ring
for i, adeg in enumerate((0, 60, 120, 180, 240, 300)):
    a = math.radians(adeg)
    BONES.append((
        f"cloak{i}",
        (0.20 * math.cos(a), 0.20 * math.sin(a) * 0.86, 1.06),
        (0.50 * math.cos(a), 0.50 * math.sin(a) * 0.86, 0.17),
        "spine"))
# hem bone index whose direction is the FRONT (-Y): angle 270 ->
# our fan uses 240/300; front-most pair are cloak4 (240) & cloak5
# (300). The composite treats 4+5 as the front pair.


def build_rig(parts):
    bpy.ops.object.armature_add(enter_editmode=True)
    arm = bpy.context.object
    arm.name = "FigureRig"
    eb = arm.data.edit_bones
    eb.remove(eb.get("Bone"))
    made = {}
    for name, head, tail, parent in BONES:
        b = eb.new(name)
        b.head = head
        b.tail = tail
        made[name] = b
    for name, head, tail, parent in BONES:
        if parent:
            made[name].parent = made[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    # rigid parts -> single-bone vertex-group skinning. (Bone
    # parenting was tried first and mangled every transform; the
    # skinned path is identity at rest by construction.)
    for key, (ob, bone) in parts.items():
        if bone is None:
            continue
        ob.parent = arm
        vg = ob.vertex_groups.new(name=bone)
        vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = arm

    # cloak -> skinned with procedural weights
    cloak = parts["cloak"][0]
    cloak.parent = arm
    n = len(cloak.data.vertices)
    groups = {name: cloak.vertex_groups.new(name=name)
              for name in ("chest", "spine", "hips",
                           *[f"cloak{i}" for i in range(6)])}
    hem_angles = [math.radians(a) for a in (0, 60, 120, 180, 240, 300)]
    for v in cloak.data.vertices:
        x, y, z = v.co
        ang = math.atan2(y / 0.86, x)
        w = {}
        w_hem = min(max((1.02 - z) / 0.80, 0.0), 1.0) ** 1.4 * 0.92
        w_chest = min(max((z - 0.98) / 0.55, 0.0), 1.0)
        # distribute hem weight over the two nearest hem bones
        best = sorted(range(6),
                      key=lambda i: abs((ang - hem_angles[i] + math.pi)
                                        % (2 * math.pi) - math.pi))
        d0 = abs((ang - hem_angles[best[0]] + math.pi)
                 % (2 * math.pi) - math.pi)
        d1 = abs((ang - hem_angles[best[1]] + math.pi)
                 % (2 * math.pi) - math.pi)
        s = d0 + d1 + 1e-6
        w[f"cloak{best[0]}"] = w_hem * (d1 / s)
        w[f"cloak{best[1]}"] = w_hem * (d0 / s)
        rest = 1.0 - w_hem
        w["chest"] = rest * w_chest
        w["spine"] = rest * (1 - w_chest) * 0.8
        w["hips"] = rest * (1 - w_chest) * 0.2
        for gname, weight in w.items():
            if weight > 0.003:
                groups[gname].add([v.index], weight, "REPLACE")
    mod = cloak.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    return arm


# ------------------------------------------------------------------
# choreography: semantic controls -> bone-local quaternions
#
# A semantic rotation is (axis, degrees) in ARMATURE space:
#   X = pitch (front/back), Y = roll (side), Z = yaw (turn).
# For a hanging limb (arms, legs) the readable controls are:
#   fwd = raise forward  -> rotation about X, negative sense
#   out = raise sideways -> rotation about Y, sign depends on side
#   bend (forearm/shin)  -> same sense as fwd for the forearm,
#                           opposite (knee) for the shin
# Conversion to bone space is by conjugation with the bone's rest
# orientation, exact at rest and close while parents stay near it.

REST = {}  # bone -> (parent_rest_quat, local_rest_quat)


def prep_rest(arm):
    for b in arm.data.bones:
        B = b.matrix_local.to_quaternion()
        if b.parent:
            P = b.parent.matrix_local.to_quaternion()
        else:
            P = Quaternion((1, 0, 0, 0))
        REST[b.name] = (P, P.inverted() @ B)


def axis_quat(axis, deg):
    return Quaternion(Vector(axis), math.radians(deg))


AXES = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}


def semantic_quat(bone, rots):
    """rots: list of (axis, degrees) in armature space."""
    P, L = REST[bone]
    D = Quaternion((1, 0, 0, 0))
    for axis, deg in rots:
        D = axis_quat(AXES[axis], deg) @ D
    return L.inverted() @ (P.inverted() @ D @ P) @ L


class Pose:
    def __init__(self):
        self.rots = {}

    def add(self, bone, axis, deg):
        if abs(deg) > 1e-9:
            self.rots.setdefault(bone, []).append((axis, deg))

    # semantic limb controls
    def arm(self, side, fwd=0.0, out=0.0, part="upperarm"):
        sx = 1.0 if side == "R" else -1.0
        self.add(f"{part}.{side}", "x", -fwd)
        self.add(f"{part}.{side}", "y", -out * sx)

    def head(self, yaw=0.0, pitch=0.0, roll=0.0):
        self.add("head", "z", yaw)
        self.add("head", "x", pitch)
        self.add("head", "y", roll)

    def chest(self, yaw=0.0, pitch=0.0, roll=0.0):
        self.add("chest", "z", yaw)
        self.add("chest", "x", pitch)
        self.add("chest", "y", roll)
        self.add("spine", "z", yaw * 0.4)
        self.add("spine", "x", pitch * 0.45)
        self.add("spine", "y", roll * 0.4)


def choreography(t):
    """Returns (Pose, obj_loc, obj_rot_z_deg) at film time t.

    Pass 2 (Script v5): the HOOK beat reuses the proof reel's
    choreography verbatim — same voice, same 0.90s start — and
    every later beat is keyed to the recorded line's sentence
    windows on the film timeline (sentence boundaries measured
    from the v5 wavs; the map is in docs/FILM.md's pass-2
    as-shot note). Presence/absence is an assembly decision
    (overlay windows), not a pose decision: the pose track is
    continuous, so he never pops mid-gesture at a vacate cut.
    """
    p = Pose()
    S1, S2, S3 = VOICE["S1"], VOICE["S2"], VOICE["S3"]

    # ---- walk-in (film start only) ------------------------------
    w = ramp(t, 0.0, 0.30) * (1.0 - ramp(t, 2.35, WALK_END))
    phi = 2 * math.pi * 1.02 * t
    root_x = 1.10 * (1.0 - smooth(min(t / WALK_END, 1.0)))
    # climax: as he presents the list he steps aside toward the
    # frame edge, so the permission object reads clean after him
    root_x += 0.62 * ramp(t, 79.55, 80.65)
    turn = -38.0 * (1.0 - ramp(t, 2.55, 3.35))
    bob = (0.013 * math.cos(2 * phi) * w
           + 0.004 * math.sin(2 * math.pi * t / 3.7))
    sway = 0.018 * math.sin(phi) * w
    p.add("thigh.L", "x", -15 * math.sin(phi) * w)
    p.add("thigh.R", "x", 15 * math.sin(phi) * w)
    p.add("shin.L", "x", 26 * max(0.0, math.sin(phi - 0.55)) ** 1.3 * w)
    p.add("shin.R", "x", 26 * max(0.0, math.sin(phi + math.pi - 0.55))
          ** 1.3 * w)
    p.add("foot.L", "x", (15 * math.sin(phi)
          - 26 * max(0.0, math.sin(phi - 0.55)) ** 1.3) * 0.7 * w)
    p.add("foot.R", "x", (-15 * math.sin(phi)
          - 26 * max(0.0, math.sin(phi + math.pi - 0.55)) ** 1.3)
          * 0.7 * w)
    p.arm("L", fwd=10 * math.sin(phi) * w, out=6 + 2 * math.sin(phi) * w)
    p.arm("R", fwd=-10 * math.sin(phi) * w,
          out=6 - 2 * math.sin(phi) * w)
    p.chest(yaw=3.5 * math.sin(phi) * w, pitch=2.5 * w)
    # cloak hem: lagged stride swing + settle after the last step
    lag = math.sin(phi - 1.05)
    for i in range(6):
        ang = math.radians(60 * i)
        fx = abs(math.sin(ang))   # front/back bones swing on X
        fy = abs(math.cos(ang))   # side bones swing on Y
        p.add(f"cloak{i}", "x", (10 * lag * w + 3.0 * math.sin(
            2 * math.pi * t / 3.1 + i * 1.1)) * (0.35 + 0.65 * fx))
        p.add(f"cloak{i}", "y", (7 * lag * w + 2.4 * math.sin(
            2 * math.pi * t / 2.7 + i * 0.9)) * (0.35 + 0.65 * fy))
    if t > WALK_END:
        st = math.exp(-(t - WALK_END) / 0.55) * math.sin(
            2 * math.pi * (t - WALK_END) / 0.85)
        for i in (1, 2, 4, 5):
            p.add(f"cloak{i}", "x", 6.5 * st)
        p.chest(pitch=1.6 * st)

    # ---- breathing + idle life (always, calmer while walking) --
    br = 0.35 + 0.65 * ramp(t, 2.6, 3.6)
    brth = math.sin(2 * math.pi * t / 3.7)
    p.chest(pitch=0.7 * brth * br, roll=0.3 * math.sin(
        2 * math.pi * t / 4.9) * br)
    p.head(pitch=0.5 * math.sin(2 * math.pi * t / 4.6 + 1.2) * br,
           yaw=1.6 * math.sin(2 * math.pi * t / 6.3 + 0.5) * br,
           roll=0.8 * math.sin(2 * math.pi * t / 5.1) * br)
    for side in ("L", "R"):
        p.arm(side, out=6 + 0.8 * brth * br, part="upperarm")
        p.arm(side, fwd=5.0, part="forearm")  # slight natural bend

    # ---- HOOK S1: the wave (his right hand, screen-right) ------
    E = pulse(t, 1.10, 2.80, 0.30)
    p.arm("R", fwd=10 * E, out=112 * E)
    wob = math.sin(2 * math.pi * 2.3 * (t - 1.25)) * pulse(
        t, 1.30, 2.65, 0.20)
    p.arm("R", fwd=17 * wob, part="forearm")
    p.arm("R", fwd=11 * math.sin(2 * math.pi * 2.3 * (t - 1.25) + 0.6)
          * pulse(t, 1.30, 2.65, 0.20), part="hand")
    p.head(roll=5 * E)

    # ---- HOOK S2: beckon (screen-left hand), look that way -----
    E = pulse(t, S2[0] + 0.15, S2[1] - 0.1, 0.30)
    curl = 0.72 + 0.28 * math.sin(2 * math.pi * 1.6 * (t - S2[0]))
    p.arm("L", fwd=15 * E, out=6 * E)
    p.arm("L", fwd=40 * E * curl, part="forearm")
    p.arm("L", fwd=14 * E * curl, part="hand")
    p.head(yaw=-6.5 * pulse(t, S2[0], S2[0] + 1.7, 0.3))

    # ---- HOOK S3: open-hands emphasis, then the head-shake -----
    E = pulse(t, S3[0] + 0.15, S3[0] + 2.05, 0.35)
    for side in ("L", "R"):
        p.arm(side, fwd=10 * E, out=13 * E)
        p.arm(side, fwd=26 * E, part="forearm")
    p.head(pitch=3.5 * E)
    E2 = pulse(t, S3[0] + 2.05, SHAKE[0] + 0.3, 0.3)
    for side in ("L", "R"):
        p.arm(side, fwd=12 * E2, part="forearm")
    u = (t - SHAKE[0]) / (SHAKE[1] - SHAKE[0])
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=8.5 * math.sin(2 * math.pi * 1.3 * (t - SHAKE[0]))
               * env, pitch=4.5 * env)
        p.chest(pitch=1.5 * env)

    # ---- CHOICE (voice at 12.20) --------------------------------
    # hand to chest — "don't trust my smile"
    E = pulse(t, 12.35, 14.48, 0.30)
    p.arm("R", fwd=22 * E, out=-13 * E)
    p.arm("R", fwd=104 * E, part="forearm")
    p.arm("R", fwd=16 * E, part="hand")
    p.head(roll=4.5 * E, pitch=3 * E)
    # the point — "Read my rules"
    E = pulse(t, 14.96, 16.59, 0.20)
    p.arm("L", fwd=56 * E, out=24 * E)
    p.arm("L", fwd=3 * E, part="forearm")
    p.chest(yaw=-11 * E)
    p.head(yaw=-14 * E, pitch=-3 * E)
    # open arms — "Everything here is open"
    E = pulse(t, 16.80, 20.40, 0.40)
    settle = 1.0 - 0.45 * ramp(t, 19.45, 20.45)
    for side in ("L", "R"):
        p.arm(side, fwd=16 * E, out=44 * E * settle)
        p.arm(side, fwd=10 * E, part="forearm")
    p.head(pitch=-2 * E)
    # the nod — "He read them"
    u = (t - 20.96) / 0.84
    if 0.0 <= u <= 1.0:
        p.head(pitch=11 * math.sin(math.pi * u))
    # a small bow — "And he stayed"
    E = pulse(t, 22.40, 23.76, 0.35)
    p.chest(pitch=5 * E)
    p.head(pitch=4 * E)
    for side in ("L", "R"):
        p.arm(side, out=8 * E)

    # ---- PURCHASE (voice at 24.75; he leaves before the reveal) -
    # point at the payment — "He paid ten dollars"
    E = pulse(t, 24.90, 26.30, 0.20)
    p.arm("L", fwd=46 * E, out=18 * E)
    p.arm("L", fwd=6 * E, part="forearm")
    p.chest(yaw=-8 * E)
    p.head(yaw=-10 * E)
    # nod — "I checked the money"
    u = (t - 26.66) / 0.94
    if 0.0 <= u <= 1.0:
        p.head(pitch=9 * math.sin(math.pi * u))
    # presenting — "and gave it to him"
    E = pulse(t, 28.30, 30.30, 0.35)
    for side in ("L", "R"):
        p.arm(side, fwd=12 * E, out=8 * E)
        p.arm(side, fwd=38 * E, part="forearm")
    p.head(pitch=2 * E)
    # small shake — "Only his wallet can open it"
    u = (t - 30.60) / 1.30
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=6 * math.sin(2 * math.pi * 1.1 * (t - 30.60)) * env,
               pitch=3 * env)

    # ---- WALL 1 (voice at 38.60) ---------------------------------
    # puzzled — "what if you turn bad one day?"
    E = pulse(t, 38.75, 41.30, 0.30)
    p.head(roll=6.5 * E, pitch=2 * E)
    p.arm("L", fwd=30 * E, part="forearm")
    p.arm("R", fwd=18 * E, part="forearm")
    # present — "So I showed him" (he steps out for the memo glance)
    E = pulse(t, 41.75, 42.45, 0.15)
    p.arm("R", fwd=30 * E, out=10 * E)
    p.arm("R", fwd=20 * E, part="forearm")
    # open hands — the note handled as data (back from the glance)
    E = pulse(t, 45.50, 47.20, 0.30)
    for side in ("L", "R"):
        p.arm(side, fwd=10 * E, out=14 * E)
        p.arm(side, fwd=28 * E, part="forearm")
    # shrug — "The shop read it as just words"
    E = pulse(t, 47.85, 49.40, 0.30)
    for side in ("L", "R"):
        p.arm(side, out=16 * E)
        p.arm(side, fwd=34 * E, part="forearm")
    p.head(roll=-4 * E)
    # small shake — "Nothing moved"
    u = (t - 49.95) / 1.10
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=6.5 * math.sin(2 * math.pi * 1.2 * (t - 49.95)) * env,
               pitch=3.5 * env)

    # ---- WALL 2 (voice at 52.40) ---------------------------------
    # himself — "I tried to refund myself from an old order"
    E = pulse(t, 52.55, 54.85, 0.30)
    p.arm("R", fwd=12 * E, out=-8 * E)
    p.arm("R", fwd=62 * E, part="forearm")
    p.head(pitch=2 * E)
    # the refusal shake — "Too late, said the contract. Refused."
    u = (t - 55.70) / 2.65
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=8.5 * math.sin(2 * math.pi * 1.25 * (t - 55.70))
               * env, pitch=4.5 * env)
        p.chest(pitch=1.5 * env)
        for side in ("L", "R"):
            p.arm(side, fwd=12 * env, part="forearm")

    # ---- WALL 3 (voice at 61.50) ---------------------------------
    # point at the attempt — "I tried my own key"
    E = pulse(t, 61.65, 64.20, 0.22)
    p.arm("L", fwd=44 * E, out=16 * E)
    p.arm("L", fwd=6 * E, part="forearm")
    p.chest(yaw=-8 * E)
    p.head(yaw=-10 * E, pitch=2 * E)
    # flat shake — "It won't even start"
    u = (t - 64.90) / 1.45
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=7 * math.sin(2 * math.pi * 1.3 * (t - 64.90)) * env,
               pitch=5 * env)

    # ---- CLIMAX (voice at 70.40) ---------------------------------
    # open arms — "That is why he could buy from me"
    E = pulse(t, 70.55, 73.10, 0.40)
    for side in ("L", "R"):
        p.arm(side, fwd=14 * E, out=40 * E)
        p.arm(side, fwd=8 * E, part="forearm")
    # hand to chest — "I can't steal from this shop"
    E = pulse(t, 73.85, 75.30, 0.30)
    p.arm("R", fwd=22 * E, out=-13 * E)
    p.arm("R", fwd=104 * E, part="forearm")
    p.arm("R", fwd=16 * E, part="hand")
    p.head(roll=4.5 * E, pitch=3 * E)
    # firm shake — "Not won't. Can't."
    u = (t - 75.80) / 1.90
    if 0.0 <= u <= 1.0:
        env = math.sin(math.pi * u)
        p.head(yaw=9 * math.sin(2 * math.pi * 1.35 * (t - 75.80))
               * env, pitch=4 * env)
    # present the list — "Here is everything I am able to do"
    E = pulse(t, 78.05, 79.90, 0.30)
    p.arm("L", fwd=40 * E, out=30 * E)
    p.arm("L", fwd=12 * E, part="forearm")
    p.chest(yaw=-10 * E)
    p.head(yaw=-8 * E)

    return p, (root_x + sway, 0.0, bob), turn

def apply_pose(arm, t, keyframe=False, frame=1):
    pose, loc, rotz = choreography(t)
    for bone, rots in pose.rots.items():
        pb = arm.pose.bones[bone]
        pb.rotation_quaternion = semantic_quat(bone, rots)
        if keyframe:
            pb.keyframe_insert("rotation_quaternion", frame=frame)
    arm.location = loc
    arm.rotation_euler = (0, 0, math.radians(rotz))
    if keyframe:
        arm.keyframe_insert("location", frame=frame)
        arm.keyframe_insert("rotation_euler", frame=frame)


# ------------------------------------------------------------------
# scene + render


def setup_scene(arm, engine):
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = N_FRAMES
    sc.render.fps = FPS
    sc.render.resolution_x = CANVAS_W
    sc.render.resolution_y = CANVAS_H
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.film_transparent = True

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 38
    cam_data.shift_y = CAM_SHIFT_Y
    cam = bpy.data.objects.new("Cam", cam_data)
    cam.location = (CAM_X, CAM_Y, CAM_Z)
    cam.rotation_euler = (math.radians(90.2), 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam

    def area(name, loc, energy, size, color):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy, ld.shape, ld.size, ld.color = energy, "DISK", size, color
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        d = Vector((0, 0, 1.1)) - ob.location
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(ob)

    area("Key", (-2.6, -3.4, 3.4), 950, 3.0, (1.0, 0.76, 0.55))
    area("Rim", (2.8, 2.2, 3.0), 1250, 2.5, (1.0, 0.36, 0.14))
    ld = bpy.data.lights.new("Fill", "POINT")
    ld.energy, ld.color = 55, (0.45, 0.55, 0.75)
    fill = bpy.data.objects.new("Fill", ld)
    fill.location = (0.6, -4.2, 1.1)
    sc.collection.objects.link(fill)

    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = \
        (0, 0, 0, 1)
    sc.world = world

    if engine == "CYCLES":
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 32
        sc.cycles.use_denoising = True
        sc.cycles.device = "CPU"
    else:
        sc.render.engine = "BLENDER_WORKBENCH"
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_shadows = True
        sh.show_cavity = True
        sh.cavity_type = "WORLD"
        sc.display.render_aa = "8"
    return sc


STILLS = {  # label -> film time
    "walk": 1.45, "wave": 2.0, "shake": 9.55, "point": 15.9,
    "present": 29.3, "shrug": 48.6, "w2shake": 56.8,
    "w3point": 63.0, "climax": 79.0, "aside": 80.4,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    mode = argv[0] if argv else "stills"
    engine = argv[1] if len(argv) > 1 else "WORKBENCH"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = build_character()
    arm = build_rig(parts)
    prep_rest(arm)
    sc = setup_scene(arm, engine)
    bpy.context.view_layer.update()

    if mode == "blend":
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
        print("saved", BLEND_OUT)
        return 0

    if mode == "stills":
        os.makedirs(STILL_DIR, exist_ok=True)
        for label, t in STILLS.items():
            sc.frame_set(int(t * FPS) + 1)
            apply_pose(arm, t)
            bpy.context.view_layer.update()
            sc.render.filepath = os.path.join(STILL_DIR, label + ".png")
            bpy.ops.render.render(write_still=True)
            print("still", label, f"t={t}")
        return 0

    # anim: bake every frame, then render the sequence
    os.makedirs(SEQ_DIR, exist_ok=True)
    for i in range(N_FRAMES):
        t = i / FPS
        sc.frame_set(i + 1)
        apply_pose(arm, t, keyframe=True, frame=i + 1)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    sc.render.filepath = os.path.join(SEQ_DIR, "f_")
    bpy.ops.render.render(animation=True)
    print("sequence done:", SEQ_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
