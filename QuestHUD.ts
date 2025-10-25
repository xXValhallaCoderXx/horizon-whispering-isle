import { PropTypes, Player } from 'horizon/core'
import { EventsService } from 'constants';
import { UIComponent, View, Image, UINode, ImageSource, ViewStyle, ImageStyle, Text, Binding, TextStyle, } from 'horizon/ui'


export class QuestHUD extends UIComponent {

  initializeUI() {
    return View({
      children: Text({
        text: 'QuestHUDsss',
        style: { color: 'black' }
      }),
      style: { backgroundColor: 'white', width: 150 },
    });
  }
}
UIComponent.register(QuestHUD);