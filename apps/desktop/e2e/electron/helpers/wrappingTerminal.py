"""Offline composer with Hermes's installed wrapping/height helpers; no inference."""
import json, os, sys
from prompt_toolkit import Application
from prompt_toolkit.layout import HSplit, Layout, Window
from prompt_toolkit.widgets import TextArea
from prompt_toolkit.layout.dimension import Dimension
from prompt_toolkit.key_binding import KeyBindings
from cli import _estimate_tui_input_height, _build_cpr_disabled_output
area = TextArea(prompt='> ', multiline=True, wrap_lines=True, height=Dimension(min=1,max=8,preferred=1))
app = None
area.window.height = lambda: _estimate_tui_input_height(area.buffer.document.lines, '> ', app.output.get_size().columns)
keys = KeyBindings()
@keys.add('c-c')
def close(event): event.app.exit()
def record(event):
    size = app.output.get_size()
    with open(os.environ['SCLIP_TEST_INPUT_LOG'], 'w') as stream:
        json.dump({'text':area.text,'cursor':area.buffer.cursor_position,'cols':size.columns,'rows':size.rows,'pid':os.getpid()},stream)
app = Application(layout=Layout(HSplit([Window(char='-',height=1),area,Window(char='-',height=1)])),key_bindings=keys,output=_build_cpr_disabled_output(sys.stdout),before_render=record,full_screen=False)
print('Offline composer ready',flush=True)
app.run()
