"""Blender batch: retain actual generated shape, reduce mesh, export review files."""
import argparse,json,math,sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/miniatures'

def finish(asset):
    id=asset['id'];bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(OUT/'raw'/f'{id}.glb'))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=asset['name']+'·形体审核样模'
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    points=[obj.matrix_world@Vector(v) for v in obj.bound_box]
    lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
    scale=3/(hi.z-lo.z)
    obj.location-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));obj.location*=scale;obj.scale*=scale
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mesh=bmesh.new();mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh,verts=list(mesh.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);mesh.free()
    before=sum(len(p.vertices)-2 for p in obj.data.polygons)
    if before>90000:
        modifier=obj.modifiers.new('审核网格减面','DECIMATE');modifier.ratio=90000/before
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    material=bpy.data.materials.new('灰陶形体材质');material.diffuse_color=(.24,.29,.29,1);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.24,.29,.29,1)
    shader.inputs['Roughness'].default_value=.73;shader.inputs['Metallic'].default_value=.10
    obj.data.materials.clear();obj.data.materials.append(material)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'models'/f'{id}.glb'),export_format='GLB',use_selection=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    scene.world.color=(.23,.23,.23)
    for name,location,power,size in [('主光',(-3,-4,6),700,4),('轮廓光',(3,3,5),950,3),('补光',(4,-2,2),250,3)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
        lamp=bpy.data.objects.new(name,light);scene.collection.objects.link(lamp);lamp.location=location
        lamp.rotation_euler=(Vector((0,0,1.4))-lamp.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('审核相机');camera=bpy.data.objects.new('审核相机',camera_data);scene.collection.objects.link(camera)
    camera.location=(4,-7,3.8);camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type='ORTHO';camera_data.ortho_scale=3.8;scene.camera=camera
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sources'/f'{id}.blend'))
    scene.render.filepath=str(OUT/'renders'/f'{id}.png');bpy.ops.render.render(write_still=True)
    triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
    record=dict(id=id,triangles=triangles,original_triangles=before,bytes=(OUT/'models'/f'{id}.glb').stat().st_size,
        model=f'miniatures/models/{id}.glb',source=f'miniatures/sources/{id}.blend',render=f'miniatures/renders/{id}.png',
        status='真实三维形体样模，未制作最终贴图或骨骼动画')
    (OUT/'models'/f'{id}.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print('完成整理',asset['name'],triangles,flush=True)

parser=argparse.ArgumentParser();parser.add_argument('--ids',nargs='*');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
for directory in ['models','sources','renders']:(OUT/directory).mkdir(parents=True,exist_ok=True)
catalog=json.loads((ROOT/'data/editorial/miniatures.json').read_text(encoding='utf-8'))
for asset in catalog['assets']:
    if asset['selected'] and (not args.ids or asset['id'] in args.ids):finish(asset)
