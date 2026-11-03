from workers.asr.worker import clean_text


def test_sensevoice_tags_are_removed_without_inventing_emojis():
    assert clean_text('<|zh|><|NEUTRAL|><|Speech|><|withitn|>你好。') == '你好。'
    assert clean_text('<|en|>Hello world.') == 'Hello world.'
    assert clean_text('<|BGM|>') == ''
